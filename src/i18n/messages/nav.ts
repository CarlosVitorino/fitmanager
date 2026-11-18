import type { Shape } from "../types";

const en = {
  today: "Today",
  calendar: "Calendar",
  members: "Members",
  payments: "Payments",
  setup: "Setup",
  home: "Home",
  book: "Book a class",
  profile: "My profile",
};
const de: Shape<typeof en> = {
  today: "Heute",
  calendar: "Kalender",
  members: "Mitglieder",
  payments: "Zahlungen",
  setup: "Einrichtung",
  home: "Start",
  book: "Kurs buchen",
  profile: "Mein Profil",
};
const es: Shape<typeof en> = {
  today: "Hoy",
  calendar: "Calendario",
  members: "Socios",
  payments: "Pagos",
  setup: "Configuración",
  home: "Inicio",
  book: "Reservar clase",
  profile: "Mi perfil",
};
const fr: Shape<typeof en> = {
  today: "Aujourd’hui",
  calendar: "Calendrier",
  members: "Adhérents",
  payments: "Paiements",
  setup: "Configuration",
  home: "Accueil",
  book: "Réserver un cours",
  profile: "Mon profil",
};
const pt: Shape<typeof en> = {
  today: "Hoje",
  calendar: "Calendário",
  members: "Membros",
  payments: "Pagamentos",
  setup: "Configuração",
  home: "Início",
  book: "Reservar aula",
  profile: "O meu perfil",
};

export default { en, de, es, fr, pt };
