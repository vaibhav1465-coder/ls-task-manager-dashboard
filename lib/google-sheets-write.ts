import {
  SignJWT,
  importPKCS8,
} from "jose";

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

type WritableField = keyof TaskWriteInput;

type SheetContext = {
  spreadsheetId: string;
  accessToken: string;
  sheetTitle: string;
  escapedTitle: string;
  values: string[][];
  headerIndex: number;
  headers: string[];
};

const aliases: Record<
  WritableField,
  string[]
> = {
  serial: ["#", "serial", "sr no", "sno"],
  taskType: [
    "task type",
    "tasktype",
    "type",
  ],
  priority: ["priorities", "priority"],
  taskName: [
    "task name",
    "taskname",
    "task",
  ],
  taskDescription: [
    "task description",
    "taskdescription",
    "description",
  ],
  team: ["team"],
  maker: ["maker"],
  owner: ["owner"],
  checker: ["checker"],
  reportDate: [
    "report date",
    "reportdate",
  ],
  startDate: [
    "start date",
    "startdate",
  ],
  eta: ["eta", "due date", "duedate"],
  liveDate: [
    "live date",
    "livedate",
    "completed date",
    "completion date",
  ],
  etaMissingReason: [
    "reason if eta missing",
    "reasonifetamissing",
    "eta missing reason",
    "delay reason",
  ],
  status: ["status", "task status"],
  comment: [
    "comment if any",
    "commentifany",
    "comment",
    "comments",
  ],
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function key(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function validateTask(
  task: TaskWriteInput,
): void {
  if (!clean(task.taskName)) {
    throw new Error("Task Name is required.");
  }

  if (!clean(task.taskType)) {
    throw new Error("Task Type is required.");
  }

  if (
    !["High", "Medium", "Low"].includes(
      clean(task.priority),
    )
  ) {
    throw new Error(
      "Priority must be High, Medium or Low.",
    );
  }

  if (
    ![
      "Pending",
      "WIP",
      "Completed",
      "Blocked",
    ].includes(clean(task.status))
  ) {
    throw new Error(
      "Status must be Pending, WIP, Completed or Blocked.",
    );
  }
}

function getCredentials(): Credentials {
  const encoded =
    process.env
      .GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

  if (!encoded) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.",
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64").toString(
        "utf8",
      ),
    ) as Credentials;

    if (
      !parsed.client_email ||
      !parsed.private_key
    ) {
      throw new Error(
        "Required service-account fields are missing.",
      );
    }

    return parsed;
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid service-account JSON.",
    );
  }
}

async function getAccessToken(): Promise<string> {
  const credentials = getCredentials();
  const now = Math.floor(Date.now() / 1000);
  const tokenUrl =
    credentials.token_uri ||
    "https://oauth2.googleapis.com/token";
  const privateKey = await importPKCS8(
    credentials.private_key,
    "RS256",
  );

  const assertion = await new SignJWT({
    scope:
      "https://www.googleapis.com/auth/spreadsheets",
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
    })
    .setIssuer(credentials.client_email)
    .setSubject(credentials.client_email)
    .setAudience(tokenUrl)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type":
        "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const payload =
    (await response.json()) as {
      access_token?: string;
      error_description?: string;
    };

  if (
    !response.ok ||
    !payload.access_token
  ) {
    throw new Error(
      payload.error_description ||
        "Google authentication failed.",
    );
  }

  return payload.access_token;
}

async function googleRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization:
        `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const payload =
    (await response.json()) as T & {
      error?: {
        message?: string;
      };
    };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        "Google Sheets API request failed.",
    );
  }

  return payload;
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result =
      String.fromCharCode(
        65 + remainder,
      ) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function findHeader(
  values: string[][],
): number {
  let bestIndex = -1;
  let bestScore = 0;

  values
    .slice(0, 20)
    .forEach((row, index) => {
      const headings = new Set(
        row.map(key),
      );
      const score = [
        "taskname",
        "status",
        "owner",
        "eta",
        "livedate",
      ].filter((heading) =>
        headings.has(heading),
      ).length;

      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });

  if (
    bestIndex < 0 ||
    bestScore < 2
  ) {
    throw new Error(
      "Task Manager header row was not found.",
    );
  }

  return bestIndex;
}

async function getSheetContext(): Promise<SheetContext> {
  const spreadsheetId =
    process.env.GOOGLE_SPREADSHEET_ID || "";
  const gid = Number(
    process.env.GOOGLE_SHEET_GID || 0,
  );

  if (!spreadsheetId) {
    throw new Error(
      "Missing GOOGLE_SPREADSHEET_ID.",
    );
  }

  const accessToken =
    await getAccessToken();

  const metadata =
    await googleRequest<{
      sheets?: Array<{
        properties?: {
          sheetId?: number;
          title?: string;
        };
      }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId,
      )}?fields=sheets.properties(sheetId,title)`,
      accessToken,
    );

  const selectedSheet =
    metadata.sheets?.find(
      (sheet) =>
        sheet.properties?.sheetId === gid,
    );

  const sheetTitle =
    selectedSheet?.properties?.title;

  if (!sheetTitle) {
    throw new Error(
      `No sheet tab found for gid ${gid}.`,
    );
  }

  const escapedTitle =
    sheetTitle.replace(/'/g, "''");
  const range = encodeURIComponent(
    `'${escapedTitle}'!A:AZ`,
  );

  const valuesPayload =
    await googleRequest<{
      values?: string[][];
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId,
      )}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
      accessToken,
    );

  const values =
    valuesPayload.values || [];
  const headerIndex =
    findHeader(values);
  const headers =
    values[headerIndex] || [];

  return {
    spreadsheetId,
    accessToken,
    sheetTitle,
    escapedTitle,
    values,
    headerIndex,
    headers,
  };
}

function columnIndexFor(
  headers: string[],
  field: WritableField,
): number {
  const candidates =
    aliases[field].map(key);

  return headers.findIndex(
    (header) =>
      candidates.includes(key(header)),
  );
}

function nextSerial(
  context: SheetContext,
): string {
  const serialIndex =
    columnIndexFor(
      context.headers,
      "serial",
    );

  if (serialIndex < 0) {
    return "";
  }

  const maximum = context.values
    .slice(context.headerIndex + 1)
    .reduce((current, row) => {
      const value = Number(
        clean(row[serialIndex]),
      );

      return Number.isFinite(value)
        ? Math.max(current, value)
        : current;
    }, 0);

  return String(maximum + 1);
}

function rowValues(
  headers: string[],
  task: TaskWriteInput,
  automaticSerial = "",
): string[] {
  const row = Array.from(
    {
      length: headers.length,
    },
    () => "",
  );

  (
    Object.keys(
      aliases,
    ) as WritableField[]
  ).forEach((field) => {
    const columnIndex =
      columnIndexFor(headers, field);

    if (columnIndex < 0) return;

    row[columnIndex] =
      field === "serial"
        ? clean(task.serial) ||
          automaticSerial
        : clean(task[field]);
  });

  return row;
}

export async function updateTaskRow(
  rowNumber: number,
  task: TaskWriteInput,
): Promise<{
  updated: true;
  rowNumber: number;
  sheetTitle: string;
}> {
  if (
    !Number.isInteger(rowNumber) ||
    rowNumber < 2 ||
    rowNumber > 100_000
  ) {
    throw new Error(
      "Invalid Google Sheet row number.",
    );
  }

  validateTask(task);

  const context =
    await getSheetContext();

  if (
    rowNumber <=
    context.headerIndex + 1
  ) {
    throw new Error(
      "The selected row is the header row and cannot be edited.",
    );
  }

  const data = (
    Object.keys(
      aliases,
    ) as WritableField[]
  )
    .map((field) => {
      const columnIndex =
        columnIndexFor(
          context.headers,
          field,
        );

      if (columnIndex < 0) {
        return null;
      }

      return {
        range:
          `'${context.escapedTitle}'!` +
          `${columnName(columnIndex)}` +
          `${rowNumber}`,
        values: [
          [clean(task[field])],
        ],
      };
    })
    .filter(
      (
        item,
      ): item is {
        range: string;
        values: string[][];
      } => item !== null,
    );

  if (!data.length) {
    throw new Error(
      "No editable Task Manager columns were matched.",
    );
  }

  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      context.spreadsheetId,
    )}/values:batchUpdate`,
    context.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption:
          "USER_ENTERED",
        data,
      }),
    },
  );

  return {
    updated: true,
    rowNumber,
    sheetTitle: context.sheetTitle,
  };
}

export async function appendTaskRow(
  task: TaskWriteInput,
): Promise<{
  created: true;
  rowNumber: number | null;
  sheetTitle: string;
}> {
  validateTask(task);

  const context =
    await getSheetContext();
  const automaticSerial =
    nextSerial(context);
  const values = rowValues(
    context.headers,
    task,
    automaticSerial,
  );

  const appendRange =
    encodeURIComponent(
      `'${context.escapedTitle}'!A:AZ`,
    );

  const result =
    await googleRequest<{
      updates?: {
        updatedRange?: string;
      };
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        context.spreadsheetId,
      )}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      context.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          majorDimension: "ROWS",
          values: [values],
        }),
      },
    );

  const updatedRange =
    result.updates?.updatedRange || "";
  const rowMatch =
    updatedRange.match(/(\d+)(?::\w*\d+)?$/);

  return {
    created: true,
    rowNumber: rowMatch
      ? Number(rowMatch[1])
      : null,
    sheetTitle: context.sheetTitle,
  };
}
