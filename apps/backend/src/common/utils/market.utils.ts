/**
 * Gets the last trading day based on the current time in US Eastern Time
 * @returns {Date} The last trading day with time set to end of day (23:59:59.999)
 */
export function getLastTradingDay(): Date {
  // Convert to US Eastern Time
  const etTime = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
  );
  const dayOfWeek = etTime.getDay();
  const etHour = etTime.getHours();
  const isAM = etTime
    .toLocaleString('en-US', { timeZone: 'America/New_York', hour12: true })
    .includes('AM');

  // Clone the date to avoid modifying the original
  const lastTradingDay = new Date(etTime);

  // Check if it's weekend
  if (dayOfWeek === 0) {
    lastTradingDay.setDate(lastTradingDay.getDate() - 2);
  } else if (dayOfWeek === 6) {
    lastTradingDay.setDate(lastTradingDay.getDate() - 1);
  } else if ((etHour === 12 && isAM) || etHour < 9) {
    if (dayOfWeek === 1) {
      lastTradingDay.setDate(lastTradingDay.getDate() - 3);
    } else {
      lastTradingDay.setDate(lastTradingDay.getDate() - 1);
    }
  } else if (etHour >= 20) {
    // After EOD update - no date adjustment needed
  } else if (etHour >= 16 && etHour < 20) {
    lastTradingDay.setDate(lastTradingDay.getDate() - 1);
  }

  // Set time to end of day
  lastTradingDay.setHours(23, 59, 59, 999);

  return lastTradingDay;
}

/**
 * Checks if the US market is currently open
 * @returns {boolean} True if the market is open, false otherwise
 */
export function isMarketOpen(): boolean {
  const etTime = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
  );
  const dayOfWeek = etTime.getDay();
  const etHour = etTime.getHours();

  // Market is closed on weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Market hours are 9:30 AM - 4:00 PM ET
  return etHour >= 9 && etHour < 16;
}

/**
 * Checks if EOD data is available (4 hours after market close)
 * @returns {boolean} True if EOD data is available, false otherwise
 */
export function isEodDataAvailable(): boolean {
  const etTime = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
  );
  const dayOfWeek = etTime.getDay();
  const etHour = etTime.getHours();

  // EOD data is not available on weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // EOD data is available 4 hours after market close (8:00 PM ET)
  return etHour >= 20;
}

export enum MarketTimeType {
  OPEN = 'OPEN', // 9:30 AM ET
  CLOSE = 'CLOSE', // 4:00 PM ET
  EOD = 'EOD', // 8:00 PM ET (EOD data available)
}

/**
 * Calculate TTL until next trading day's specified market time
 * @param currentTime Current time in ET
 * @param timeType Market time type (OPEN, CLOSE, or EOD)
 * @param hourOffset Hours to add or subtract from the target time (default: 0)
 * @returns TTL in milliseconds
 */
export function getNextTradingDayTTL(
  timeType: MarketTimeType,
  currentTime: Date = new Date(),
  hourOffset: number = 0,
): number {
  // Convert to ET if not already
  const currentTimeET = new Date(
    currentTime.toLocaleString('en-US', { timeZone: 'America/New_York' }),
  );

  // Calculate next trading day
  const nextTradingDayET = new Date(currentTimeET);
  nextTradingDayET.setDate(currentTimeET.getDate() + 1);

  // Set base time based on timeType
  let targetHour: number;
  switch (timeType) {
    case MarketTimeType.OPEN:
      targetHour = 9.5; // 9:30 AM
      break;
    case MarketTimeType.CLOSE:
      targetHour = 16; // 4:00 PM
      break;
    case MarketTimeType.EOD:
      targetHour = 20; // 8:00 PM
      break;
  }

  // Apply hour offset
  targetHour += hourOffset;

  // Create target date string with calculated hour
  const targetDateStr = `${nextTradingDayET.getFullYear()}-${String(nextTradingDayET.getMonth() + 1).padStart(2, '0')}-${String(nextTradingDayET.getDate()).padStart(2, '0')}T${String(Math.floor(targetHour)).padStart(2, '0')}:${String(Math.round((targetHour % 1) * 60)).padStart(2, '0')}:00`;

  // Parse the date string in ET timezone
  const targetDate = new Date(
    new Date(targetDateStr).toLocaleString('en-US', {
      timeZone: 'America/New_York',
    }),
  );

  return targetDate.getTime() - currentTimeET.getTime();
}

/**
 * Gets the TTL for real-time market data based on market hours
 * @returns {number} TTL in milliseconds
 * - During market hours: 15 minutes (900,000 ms)
 * - Outside market hours: until next market open
 */
export function getRealtimeMarketDataTTL(): number {
  if (isMarketOpen()) {
    // During market hours: 15 minutes TTL
    return 15 * 60 * 1000; // 15 minutes in milliseconds
  } else {
    // Outside market hours: until next market open
    return getNextTradingDayTTL(MarketTimeType.OPEN);
  }
}
