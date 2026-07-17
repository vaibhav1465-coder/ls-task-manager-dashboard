import { cookies } from "next/headers";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";
import { fetchDashboard } from "@/lib/google-sheets";
import {
  appendTaskRow,
  updateTaskRow,
  type TaskWriteInput,
} from "@/lib/google-sheets-write";

export const runtime = "nodejs";

async function authorized(): Promise<boolean> {
  const cookieStore = await cookies();

  return verifySessionToken(
    cookieStore.get(COOKIE_NAME)?.value,
  );
}

function isSameOrigin(
  request: NextRequest,
): boolean {
  const origin =
    request.headers.get("origin");
  const host =
    request.headers.get("host");

  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function normalizeTask(
  input: Partial<TaskWriteInput>,
): TaskWriteInput {
  return {
    serial: String(input.serial ?? ""),
    taskType: String(
      input.taskType ?? "",
    ),
    priority: String(
      input.priority ?? "",
    ),
    taskName: String(
      input.taskName ?? "",
    ),
    taskDescription: String(
      input.taskDescription ?? "",
    ),
    team: String(input.team ?? ""),
    maker: String(input.maker ?? ""),
    owner: String(input.owner ?? ""),
    checker: String(
      input.checker ?? "",
    ),
    reportDate: String(
      input.reportDate ?? "",
    ),
    startDate: String(
      input.startDate ?? "",
    ),
    eta: String(input.eta ?? ""),
    liveDate: String(
      input.liveDate ?? "",
    ),
    etaMissingReason: String(
      input.etaMissingReason ?? "",
    ),
    status: String(
      input.status ?? "",
    ),
    comment: String(
      input.comment ?? "",
    ),
  };
}

function unauthorized() {
  return NextResponse.json(
    {
      error: "Unauthorized",
    },
    {
      status: 401,
    },
  );
}

function invalidOrigin() {
  return NextResponse.json(
    {
      error:
        "Cross-origin task updates are not allowed.",
    },
    {
      status: 403,
    },
  );
}

export async function GET(
  request: NextRequest,
) {
  if (!(await authorized())) {
    return unauthorized();
  }

  try {
    const force =
      request.nextUrl.searchParams.get(
        "force",
      ) === "1";

    const data =
      await fetchDashboard(force);

    return NextResponse.json(data, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Task Manager data.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  if (!(await authorized())) {
    return unauthorized();
  }

  if (!isSameOrigin(request)) {
    return invalidOrigin();
  }

  try {
    const body =
      (await request.json()) as {
        task?: Partial<TaskWriteInput>;
      };

    if (!body.task) {
      return NextResponse.json(
        {
          error: "task is required.",
        },
        {
          status: 400,
        },
      );
    }

    const created =
      await appendTaskRow(
        normalizeTask(body.task),
      );

    const refreshed =
      await fetchDashboard(true);

    return NextResponse.json(
      {
        ok: true,
        created,
        data: refreshed,
      },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to add the task to Google Sheets.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(
  request: NextRequest,
) {
  if (!(await authorized())) {
    return unauthorized();
  }

  if (!isSameOrigin(request)) {
    return invalidOrigin();
  }

  try {
    const body =
      (await request.json()) as {
        rowNumber?: number;
        task?: Partial<TaskWriteInput>;
      };

    if (
      !Number.isInteger(
        body.rowNumber,
      ) ||
      !body.task
    ) {
      return NextResponse.json(
        {
          error:
            "rowNumber and task are required.",
        },
        {
          status: 400,
        },
      );
    }

    await updateTaskRow(
      body.rowNumber as number,
      normalizeTask(body.task),
    );

    const refreshed =
      await fetchDashboard(true);

    return NextResponse.json(
      {
        ok: true,
        data: refreshed,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the Google Sheet.",
      },
      {
        status: 500,
      },
    );
  }
}
