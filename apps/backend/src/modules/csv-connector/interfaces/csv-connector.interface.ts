export interface CsvConnectorTemplate {
  name: string;
  displayName: string;
  description: string;
  standardFields: Record<string, string>; // standardized field name → CSV column name
  searchableColumns: string[]; // CSV columns to combine for embedding
  metadataColumns: string[]; // CSV columns to store as metadata
}

export interface CsvConfig {
  connectorType: 'social_media_post' | 'news_article' | 'custom';
  fieldMappings: Record<string, string>; // CSV column → standardized field
  searchableColumns: string[]; // Columns to combine for embedding
  totalRows: number;
  headers: string[];
}

export interface CsvRowData {
  [columnName: string]: string | number | null;
}

export interface CsvParseResult {
  success: boolean;
  headers: string[];
  rows: CsvRowData[];
  totalRows: number;
  errors?: string[];
}

export interface CsvSegmentData {
  content: string; // Combined text from searchable columns
  csvRow: CsvRowData; // Full row data
  position: number; // Row index
}
