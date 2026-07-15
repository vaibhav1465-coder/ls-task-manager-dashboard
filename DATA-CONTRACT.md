# Task Manager data contract

## Core columns

Task ID, Date Started, Task Name, Task Brief, Category, Owner, Priority, Status, Task Completed Date, Current Stack Used, Output / Deliverable, Business Impact, Current Limitation, Future Scaling Stack, Next Action, Scale Readiness, Notes.

## Strongly recommended optional columns

- Due Date: enables real overdue and on-time delivery measurement.
- Progress %: enables progress bars and weighted portfolio completion.
- Last Updated: detects stale tasks.
- Blocker Reason: separates blocked-task causes.
- Dependencies: supports dependency risk reporting.
- Effort Estimate and Actual Effort: enables planning accuracy and capacity analysis.

## Data-quality rules

- Task ID must be unique and never reused.
- Status, Priority, Owner, Category and Scale Readiness should use Google Sheets dropdown validation.
- Dates should be true date cells rather than free text.
- Progress should be numeric from 0 to 100.
- Completed tasks should have Task Completed Date.
- Blocked tasks should have Blocker Reason and Next Action.
- Formula columns such as Days Open and Month should be protected from manual editing.
