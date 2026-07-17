import { SignJWT, importPKCS8 } from "jose";

type Credentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type TaskWriteInput = {
  serial: string;
  taskType: string;
  priority: string;
  taskName: string;
  taskDescription: string;
  team: string;
  maker: string;
  owner: string;
  checker: string;
  reportDate: string;
  startDate: string;
  eta: string;
  liveDate: string;
  etaMissingReason: string;
  status: string;
  comment: string;
};

const aliases: Record<keyof TaskWriteInput, string[]> = {
  serial: ["#", "serial", "sr no", "sno"],
  taskType: ["task type", "tasktype", "type"],
  priority: ["priorities", "priority"],
  taskName: ["task name", "taskname", "task"],
  taskDescription: [
    "task description",
    "taskdescription",
    "description",
  ],
  team: ["team"],
  maker: ["maker"],
  owner: ["owner"],
  checker: ["checker"],
  reportDate: ["report date", "reportdate"],
  startDate: ["start date", "startdate"],
  eta: ["eta", "due date", "duedate"],
  liveDate: ["live date", "livedate", "completed date"],
  etaMissingReason: [
    "reason if eta missing",
    "reasonifetamissing",
    "eta missing reason",
  ],
  status: ["status"],
  comment: [
    "comment if any",
    "commentifany",
    "comment",
    "comments",
  ],
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function key(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getCredentials(): Credentials {
  const encoded =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

  if (!encoded) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.",
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as Credentials;

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error();
    }

    return parsed;
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is invalid.",
    );
  }
}

async function getAccessToken() {
  const account = getCredentials();
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(
    account.private_key,
    "RS256",
  );

  const tokenUrl =
    account.token_uri ||
    "https://oauth2.googleapis.com/token";

  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets",
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
    })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUrl)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        "Google authentication failed.",
    );
  }

  return payload.access_token;
}

async function googleRequest(
  url: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      (
        payload as {
          error?: {
            message?: string;
          };
        }
      )?.error?.message ||
        "Google Sheets API request failed.",
    );
  }

  return payload;
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result =
      String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function findHeader(values: string[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  values.slice(0, 20).forEach((row, index) => {
    const headings = new Set(row.map(key));

    const score = [
      "taskname",
      "status",
      "owner",
      "eta",
      "livedate",
    ].filter((heading) => headings.has(heading)).length;

    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  if (bestIndex < 0 || bestScore < 2) {
    throw new Error(
      "Task Manager header row was not found.",
    );
  }

  return bestIndex;
}

export async function updateTaskRow(
  rowNumber: number,
  task: TaskWriteInput,
) {
  if (
    !Number.isInteger(rowNumber) ||
    rowNumber < 2 ||
    rowNumber > 100000
  ) {
    throw new Error("Invalid Google Sheet row number.");
  }

  const statuses = [
    "Pending",
    "WIP",
    "Completed",
    "Blocked",
  ];

  if (!statuses.includes(clean(task.status))) {
    throw new Error(
      "Status must be Pending, WIP, Completed or Blocked.",
    );
  }

  const spreadsheetId =
    process.env.GOOGLE_SPREADSHEET_ID || "";
  const gid = Number(process.env.GOOGLE_SHEET_GID || 0);

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SPREADSHEET_ID.");
  }

  const token = await getAccessToken();

  const metadata = (await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}?fields=sheets.properties(sheetId,title)`,
    token,
  )) as {
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
      };
    }>;
  };

  const selected = metadata.sheets?.find(
    (sheet) => sheet.properties?.sheetId === gid,
  );

  const title = selected?.properties?.title;

  if (!title) {
    throw new Error(
      `No sheet tab found for gid ${gid}.`,
    );
  }

  const escapedTitle = String(title).replace(/'/g, "''");
  const range = encodeURIComponent(
    `'${escapedTitle}'!A:AZ`,
  );

  const valuesPayload = (await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    token,
  )) as {
    values?: string[][];
  };

  const values = valuesPayload.values || [];
  const headerIndex = findHeader(values);
  const headers = values[headerIndex] || [];

  if (rowNumber <= headerIndex + 1) {
    throw new Error(
      "The selected row is the header row.",
    );
  }

  const data = (
    Object.keys(aliases) as Array<
      keyof TaskWriteInput
    >
  )
    .map((field) => {
      const candidates = aliases[field].map(key);
      const columnIndex = headers.findIndex((header) =>
        candidates.includes(key(header)),
      );

      if (columnIndex < 0) return null;

      return {
        range: `'${escapedTitle}'!${columnName(
          columnIndex,
        )}${rowNumber}`,
        values: [[clean(task[field])]],
      };
    })
    .filter(
      (
        item,
      ): item is {
        range: string;
        values: string[][];
      } => Boolean(item),
    );

  if (!data.length) {
    throw new Error(
      "No editable Task Manager columns were matched.",
    );
  }

  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values:batchUpdate`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data,
      }),
    },
  );

  return {
    updated: true,
    rowNumber,
    sheetTitle: title,
  };
}
