export interface NewsEvent {
  date: string;
  time: string;
  currency: string;
  impact: 'H' | 'M' | 'L' | 'N';
  event: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface NewsCalendar {
  events: NewsEvent[];
  currencies: string[];
  dateRange: {
    from: string;
    to: string;
  };
}

export function parseHistoricalNewsCSV(content: string): NewsCalendar {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    return { events: [], currencies: [], dateRange: { from: '', to: '' } };
  }

  // Skip header
  const dataLines = lines.slice(1);
  const events: NewsEvent[] = [];
  const currencySet = new Set<string>();
  let minDate = '';
  let maxDate = '';

  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 5) continue;

    const [date, time, currency, impact, event, actual, forecast, previous] = parts;
    
    if (!date || !time) continue;

    const fullDate = `${date} ${time}`;
    if (!minDate || fullDate < minDate) minDate = fullDate;
    if (!maxDate || fullDate > maxDate) maxDate = fullDate;

    currencySet.add(currency);

    events.push({
      date,
      time,
      currency,
      impact: (impact as 'H' | 'M' | 'L' | 'N'),
      event,
      actual: actual?.trim(),
      forecast: forecast?.trim(),
      previous: previous?.trim(),
    });
  }

  return {
    events,
    currencies: Array.from(currencySet).sort(),
    dateRange: {
      from: minDate,
      to: maxDate,
    },
  };
}

export function filterNewsByCurrency(
  calendar: NewsCalendar,
  currencies: string[]
): NewsEvent[] {
  if (!currencies.length) return calendar.events;
  return calendar.events.filter((e) =>
    currencies.some((c) => e.currency.toUpperCase() === c.toUpperCase())
  );
}

export function filterNewsByImpact(
  calendar: NewsEvent[],
  minImpact: number
): NewsEvent[] {
  const impactOrder = { H: 3, M: 2, L: 1, N: 0 };
  return calendar.filter((e) => (impactOrder[e.impact] || 0) >= minImpact);
}

export function isNewsActive(
  calendar: NewsCalendar,
  checkTime: Date,
  minutesBefore: number,
  minutesAfter: number,
  currencies: string[],
  minImpact: number
): boolean {
  const windowStart = new Date(checkTime.getTime() - minutesBefore * 60 * 1000);
  const windowEnd = new Date(checkTime.getTime() + minutesAfter * 60 * 1000);

  for (const event of calendar.events) {
    const eventDate = new Date(`${event.date} ${event.time}`);
    const impactValue = { H: 3, M: 2, L: 1, N: 0 }[event.impact] || 0;

    if (impactValue < minImpact) continue;
    if (eventDate < windowStart || eventDate > windowEnd) continue;
    
    if (currencies.length > 0) {
      const matchesCurrency = currencies.some(
        (c) => event.currency.toUpperCase() === c.toUpperCase()
      );
      if (!matchesCurrency) continue;
    }

    return true;
  }

  return false;
}
