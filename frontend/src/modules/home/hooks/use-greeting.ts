export function useGreeting(fullName: string): { greeting: string; firstName: string } {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;

  return { greeting, firstName };
}
