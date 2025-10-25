export class ApiKeyCreateResponseDto {
  id: string;
  name: string;
  key: string; // Full key, only returned once
  prefix: string;
  createdAt: Date;
}
