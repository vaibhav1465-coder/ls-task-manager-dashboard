"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Task } from "@/types/task";

type Props = {
  task: Task | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type EditableStringField =
  | "serial"
  | "taskType"
  | "priority"
  | "taskName"
  | "taskDescription"
  | "team"
  | "maker"
  | "owner"
  | "checker"
  | "reportDate"
  | "startDate"
  | "eta"
  | "liveDate"
  | "etaMissingReason"
  | "status"
  | "comment";

const fields: Array<{
  key: EditableStringField;
  label: string;
  wide?: boolean;
  textarea?: boolean;
}> = [
  { key: "serial", label: "#" },
  { key: "taskType", label: "Task Type" },
  { key: "taskName", label: "Task Name" },
  {
    key: "taskDescription",
    label: "Task Description",
    wide: true,
    textarea: true,
  },
  { key: "team", label: "Team" },
  { key: "maker", label: "Maker" },
  { key: "owner", label: "Owner" },
  { key: "checker", label: "Checker" },
  { key: "reportDate", label: "Report Date" },
  { key: "startDate", label: "Start Date" },
  { key: "eta", label: "ETA" },
  { key: "liveDate", label: "Live Date" },
  {
    key: "etaMissingReason",
    label: "Reason if ETA missing",
    wide: true,
    textarea: true,
  },
  {
    key: "comment",
    label: "Comment if any",
    wide: true,
    textarea: true,
  },
];

export default function TaskEditor({ task, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Task | null>(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(task);
    setError("");
  }, [task]);

  if (!task || !form) return null;

  const update = (field: EditableStringField, value: string) => {
    setForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
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
            serial: form.serial,
            taskType: form.taskType,
            priority: form.priority,
            taskName: form.taskName,
            taskDescription: form.taskDescription,
            team: form.team,
            maker: form.maker,
            owner: form.owner,
            checker: form.checker,
            reportDate: form.reportDate,
            startDate: form.startDate,
            eta: form.eta,
            liveDate: form.liveDate,
            etaMissingReason: form.etaMissingReason,
            status: form.status,
            comment: form.comment,
          },
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "Unable to update the Google Sheet.",
        );
      }

      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save task.",
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
        <header className="task-editor-head">
          <div>
            <span>GOOGLE SHEETS TWO-WAY SYNC</span>
            <h2 id="task-editor-title">Edit Task</h2>
            <p>
              Saving updates row {form.rowNumber} in the connected Task Manager
              tab.
            </p>
          </div>

          <button
            type="button"
            className="task-editor-close"
            onClick={onClose}
            aria-label="Close editor"
          >
            ×
          </button>
        </header>

        <form onSubmit={save}>
          <div className="task-editor-grid">
            <label>
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(event) => update("priority", event.target.value)}
              >
                <option value="">Select priority</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => update("status", event.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="WIP">WIP</option>
                <option value="Completed">Completed</option>
                <option value="Blocked">Blocked</option>
              </select>
            </label>

            {fields.map((field) => (
              <label
                key={field.key}
                className={field.wide ? "task-editor-wide" : ""}
              >
                <span>{field.label}</span>
                {field.textarea ? (
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

          {error ? <div className="task-editor-error">{error}</div> : null}

          <div className="task-editor-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
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
