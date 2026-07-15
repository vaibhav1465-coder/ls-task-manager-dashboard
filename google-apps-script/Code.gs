const TASK_MANAGER_GID = 1037399204;

/**
 * Bound Google Apps Script trigger.
 * Automatically keeps task-level timestamps and completion fields accurate.
 * It runs only on the Task Manager tab identified by gid.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getSheetId() !== TASK_MANAGER_GID) return;

  const values = sheet.getDataRange().getDisplayValues();
  const headerIndex = values.findIndex(row => {
    const headers = row.map(value => String(value).trim().toLowerCase());
    return headers.includes('task id') && (headers.includes('task name') || headers.includes('status'));
  });
  if (headerIndex < 0 || e.range.getRow() <= headerIndex + 1) return;

  const headers = values[headerIndex].map(value => String(value).trim().toLowerCase());
  const column = name => {
    const index = headers.indexOf(name.toLowerCase());
    return index >= 0 ? index + 1 : 0;
  };

  const statusColumn = column('status');
  const completedDateColumn = column('task completed date');
  const lastUpdatedColumn = column('last updated');
  const progressColumn = column('progress %') || column('progress');
  const blockerColumn = column('blocker reason');
  const nextActionColumn = column('next action');
  const row = e.range.getRow();

  if (lastUpdatedColumn) {
    sheet.getRange(row, lastUpdatedColumn).setValue(new Date()).setNumberFormat('dd-mmm-yyyy hh:mm');
  }

  if (!statusColumn) return;
  const status = String(sheet.getRange(row, statusColumn).getDisplayValue()).trim().toLowerCase();

  if (status === 'completed') {
    if (completedDateColumn && !sheet.getRange(row, completedDateColumn).getValue()) {
      sheet.getRange(row, completedDateColumn).setValue(new Date()).setNumberFormat('dd-mmm-yyyy');
    }
    if (progressColumn) sheet.getRange(row, progressColumn).setValue(100);
  }

  if (status === 'not started' && progressColumn && sheet.getRange(row, progressColumn).getValue() === '') {
    sheet.getRange(row, progressColumn).setValue(0);
  }

  if (status === 'blocked') {
    const missing = [];
    if (blockerColumn && !sheet.getRange(row, blockerColumn).getDisplayValue().trim()) missing.push('Blocker Reason');
    if (nextActionColumn && !sheet.getRange(row, nextActionColumn).getDisplayValue().trim()) missing.push('Next Action');
    if (missing.length) {
      sheet.getRange(row, statusColumn).setNote(`Complete: ${missing.join(' and ')}`);
    }
  } else {
    sheet.getRange(row, statusColumn).clearNote();
  }
}
