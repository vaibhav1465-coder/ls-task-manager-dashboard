"use client";

import { FormEvent, useEffect, useState } from "react";

export type EditableTask = {
  rowNumber: number;
  id: string;
  taskType: string;
  priority: string;
  taskName: string;
  description: string;
  team: string;
  maker: string;
  owner: string;
  checker: string;
  reportDate: string;
  startDate: string;
  eta: string;
  liveDate: string;
  etaReason: string;
  status: string;
  comment: string;
};

type Props = {
  task: EditableTask | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type EditableKey = Exclude<keyof EditableTask, "rowNumber">;

const fields: Array<{
  key: EditableKey;
  label: string;
  wide?: boolean;
}> = [
  { key: "id", label: "#" },
  { key: "taskType", label: "Task Type" },
  { key: "taskName", label: "Task Name" },
  { key: "description", label: "Task Description", wide: true },
  { key: "team", label: "Team" },
  { key: "maker", label: "Maker" },
  { key: "owner", label: "Owner" },
  { key: "checker", label: "Checker" },
  { key: "reportDate", label: "Report Date" },
  { key: "startDate", label: "Start Date" },
  { key: "eta", label: "ETA" },
  { key: "liveDate", label: "Live Date" },
  { key: "etaReason", label: "Reason if ETA missing", wide: true },
  { key: "comment", label: "Comment if any", wide: true },
];

export default function TaskEditor({
  task,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<EditableTask | null>(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(task);
    setError("");
  }, [task]);

  if (!task || !form) return null;

  const update = (key: EditableKey, value: string) => {
    setForm((current) =>
      current ? { ...current, [key]: value } : current,
    );
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rowNumber: form.rowNumber,
          task: {
            serial: form.id,
            taskType: form.taskType,
            priority: form.priority,
            taskName: form.taskName,
            taskDescription: form.description,
            team: form.team,
            maker: form.maker,
            owner: form.owner,
            checker: form.checker,
            reportDate: form.reportDate,
            startDate: form.startDate,
            eta: form.eta,
            liveDate: form.liveDate,
            etaMissingReason: form.etaReason,
            status: form.status,
            comment: form.comment,
          },
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error || "Unable to update the Google Sheet.",
        );
      }

      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save task.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="task-editor-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="task-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="task-editor-head">
          <div>
            <span>GOOGLE SHEETS TWO-WAY SYNC</span>
            <h2 id="task-editor-title">Edit Task</h2>
            <p>
              Saving here updates row {form.rowNumber} in the connected
              Task Manager tab.
            </p>
          </div>

          <button
            type="button"
            className="task-editor-close"
            onClick={onClose}
            aria-label="Close"
          >
            X
          </button>
        </div>

        <form onSubmit={save}>
          <div className="task-editor-grid">
            <label>
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  update("priority", event.target.value)
                }
              >
                <option value="">Select priority</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  update("status", event.target.value)
                }
              >
                <option>Pending</option>
                <option>WIP</option>
                <option>Completed</option>
                <option>Blocked</option>
              </select>
            </label>

            {fields.map((field) => (
              <label
                key={field.key}
                className={field.wide ? "task-editor-wide" : ""}
              >
                <span>{field.label}</span>

                {field.wide ? (
                  <textarea
                    rows={3}
                    value={form[field.key]}
                    onChange={(event) =>
                      update(field.key, event.target.value)
                    }
                  />
                ) : (
                  <input
                    value={form[field.key]}
                    onChange={(event) =>
                      update(field.key, event.target.value)
                    }
                  />
                )}
              </label>
            ))}
          </div>

          {error && (
            <div className="task-editor-error">{error}</div>
          )}

          <div className="task-editor-actions">
            <button
              type="button"
              className="task-editor-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="task-editor-save"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save to Google Sheet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
