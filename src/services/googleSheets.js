import { google } from "googleapis";
import { normalizePriority } from "./priority";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Tasks";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getCredentials() {
  const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (jsonKey) {
    try {
      return JSON.parse(jsonKey);
    } catch (error) {
      throw new Error("Invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY.");
    }
  }

  if (keyFile) {
    return { keyFile };
  }

  throw new Error(
    "Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS."
  );
}

async function getSheetsClient() {
  if (!SPREADSHEET_ID) {
    throw new Error("Missing GOOGLE_SHEETS_SPREADSHEET_ID environment variable.");
  }

  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
    ...getCredentials(),
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

function formatTaskRow(task) {
  const dueDate = task.due_on || task.dueAt || task.due_date || "";
  const assignee = typeof task.assignee === "string"
    ? task.assignee
    : task.assignee?.name || task.assignee?.email || "";

  return [
    task.gid || task.id || "",
    task.name || task.title || "",
    task.notes || task.description || "",
    task.completed ? "Completed" : "Open",
    dueDate,
    assignee,
    normalizePriority(task.priority) || "",
    task.createdAt || task.created_at || "",
    task.updatedAt || task.updated_at || new Date().toISOString(),
  ];
}

function buildHeaderRow() {
  return [
    "Asana ID",
    "Task Name",
    "Notes",
    "Status",
    "Due Date",
    "Assignee",
    "Priority",
    "Created At",
    "Updated At",
  ];
}

function normalizeRows(rows = []) {
  const header = rows[0] || [];
  return rows.slice(1).map((row) => {
    const record = {};
    header.forEach((column, index) => {
      record[column] = row[index] ?? "";
    });
    return record;
  });
}

export async function getSheetRows() {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I`,
    majorDimension: "ROWS",
  });

  const rows = response.data.values || [];
  if (!rows.length) {
    return [];
  }

  return normalizeRows(rows);
}

export async function appendTaskRow(task) {
  const sheets = await getSheetsClient();
  const values = [formatTaskRow(task)];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  return { appended: true, taskId: task.gid || task.id };
}

export async function updateTaskRow(task) {
  const sheets = await getSheetsClient();
  const existingRows = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:A`,
    majorDimension: "COLUMNS",
  });

  const ids = existingRows.data.values?.[0] || [];
  const taskId = task.gid || task.id;
  const rowIndex = ids.findIndex((id) => id === taskId);

  if (rowIndex === -1) {
    return appendTaskRow(task);
  }

  const rowNumber = rowIndex + 1;
  const values = [formatTaskRow(task)];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${rowNumber}:I${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return { updated: true, taskId };
}

export default {
  appendTaskRow,
  updateTaskRow,
  getSheetRows,
};
