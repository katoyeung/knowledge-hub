export enum DeduplicationStrategy {
  HASH = 'hash', // Use hash field (if provided)
  TITLE_CONTENT = 'title_content', // Match by title + content only
  TITLE_CONTENT_SITE = 'title_content_site', // Match by title + content + site (from meta)
  TITLE_CONTENT_CHANNEL = 'title_content_channel', // Match by title + content + channel (from meta)
  TITLE_CONTENT_SITE_CHANNEL = 'title_content_site_channel', // Match by title + content + site + channel
  CUSTOM = 'custom', // Use custom field mapping provided in request
}
