import {
  NextRequest,
  NextResponse,
} from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";
import { fetchDashboard } from "@/lib/google-sheets";
import {
  updateTaskRow,
  type TaskWriteInput,
} from "@/lib/google-sheets-write";

export const runtime = "nodejs";

async function authorized() {
  const store = await cookies();

  return verifySessionToken(
    store.get(COOKIE_NAME)?.value,
  );
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await authorized())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const data = await fetchDashboard(
      request.nextUrl.searchParams.get("force") === "1",
    );

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
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
) {
  if (!(await authorized())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!sameOrigin(request)) {
    return NextResponse.json(
      {
        error:
          "Cross-origin task updates are not allowed.",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      rowNumber?: number;
      task?: Partial<TaskWriteInput>;
    };

    if (
      !Number.isInteger(body.rowNumber) ||
      !body.task
    ) {
      return NextResponse.json(
        {
          error: "rowNumber and task are required.",
        },
        { status: 400 },
      );
    }

    const task: TaskWriteInput = {
      serial: String(body.task.serial ?? ""),
      taskType: String(body.task.taskType ?? ""),
      priority: String(body.task.priority ?? ""),
      taskName: String(body.task.taskName ?? ""),
      taskDescription: String(
        body.task.taskDescription ?? "",
      ),
      team: String(body.task.team ?? ""),
      maker: String(body.task.maker ?? ""),
      owner: String(body.task.owner ?? ""),
      checker: String(body.task.checker ?? ""),
      reportDate: String(
        body.task.reportDate ?? "",
      ),
      startDate: String(body.task.startDate ?? ""),
      eta: String(body.task.eta ?? ""),
      liveDate: String(body.task.liveDate ?? ""),
      etaMissingReason: String(
        body.task.etaMissingReason ?? "",
      ),
      status: String(body.task.status ?? ""),
      comment: String(body.task.comment ?? ""),
    };

    await updateTaskRow(
      body.rowNumber as number,
      task,
    );

    const refreshed = await fetchDashboard(true);

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
      { status: 500 },
    );
  }
}
