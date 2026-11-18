/** Content of the sample studio used by the public demo and the dev seed. */
import type { Shape } from "../types";

const en = {
  studioName: "Harbour Strength",
  upper: "Upper body",
  upperDesc: "Push, pull and core.",
  legs: "Legs day",
  legsDesc: "Squats, lunges, deadlifts.",
  hiit: "HIIT",
  hiitDesc: "Short, hard intervals.",
  mobility: "Mobility",
  mobilityDesc: "Stretching and joint work.",
  noteProgramme:
    "<h3>Your block until Christmas</h3><ul><li><strong>2× strength</strong> (Upper body + Legs day)</li><li><strong>1× HIIT</strong> for conditioning</li><li>Mobility on Saturdays if you can</li></ul><p>We'll retest the squat in mid-December.</p>",
  noteProgress: "<p>Great progress on your squat depth. Next goal: <strong>3×8 at 50 kg</strong>.</p>",
  noteHealth: "<p>Mentioned a sore left knee in October. Keep an eye on lunges and box jumps.</p>",
  gender: "Female",
  customGoal: "First pull-up",
  goalNotes:
    "<p>Wants to feel strong carrying her kids and do her <strong>first strict pull-up</strong> by summer.</p>",
  trainingNotes:
    "<p>Ran casually for years, new to lifting. Prefers evening classes; enjoys strength more than cardio.</p>",
  injuries: "<p>Left knee: mild pain on deep lunges. No pain on squats.</p>",
  goodwill: "Goodwill: class cancelled at short notice",
  tagline: "Small-group strength training in the heart of Porto.",
  about:
    "<p>We're a small studio with <strong>a maximum of 12 people per class</strong>, so your coach knows your name, your goals and your knees.</p><ul><li>Strength, HIIT and mobility classes every week</li><li>Private sessions on Tuesdays and Thursdays</li><li>New here? Start with a single class and see how it feels.</li></ul>",
};

const de: Shape<typeof en> = {
  studioName: "Harbour Strength",
  upper: "Oberkörper",
  upperDesc: "Drücken, Ziehen und Rumpf.",
  legs: "Beintag",
  legsDesc: "Kniebeugen, Ausfallschritte, Kreuzheben.",
  hiit: "HIIT",
  hiitDesc: "Kurze, harte Intervalle.",
  mobility: "Mobility",
  mobilityDesc: "Dehnen und Gelenkarbeit.",
  noteProgramme:
    "<h3>Dein Block bis Weihnachten</h3><ul><li><strong>2× Kraft</strong> (Oberkörper + Beintag)</li><li><strong>1× HIIT</strong> für die Kondition</li><li>Samstags Mobility, wenn du kannst</li></ul><p>Mitte Dezember testen wir die Kniebeuge erneut.</p>",
  noteProgress:
    "<p>Toller Fortschritt bei der Tiefe deiner Kniebeuge. Nächstes Ziel: <strong>3×8 mit 50 kg</strong>.</p>",
  noteHealth:
    "<p>Hat im Oktober ein schmerzendes linkes Knie erwähnt. Bei Ausfallschritten und Box Jumps aufpassen.</p>",
  gender: "Weiblich",
  customGoal: "Erster Klimmzug",
  goalNotes:
    "<p>Möchte sich beim Tragen ihrer Kinder stark fühlen und bis zum Sommer ihren <strong>ersten sauberen Klimmzug</strong> schaffen.</p>",
  trainingNotes:
    "<p>Läuft seit Jahren locker, neu im Krafttraining. Bevorzugt Abendkurse; mag Kraft lieber als Cardio.</p>",
  injuries: "<p>Linkes Knie: leichte Schmerzen bei tiefen Ausfallschritten. Keine Schmerzen bei Kniebeugen.</p>",
  goodwill: "Kulanz: Kurs kurzfristig abgesagt",
  tagline: "Krafttraining in kleinen Gruppen im Herzen von Porto.",
  about:
    "<p>Wir sind ein kleines Studio mit <strong>höchstens 12 Personen pro Kurs</strong> – deine Trainerin kennt deinen Namen, deine Ziele und deine Knie.</p><ul><li>Jede Woche Kraft-, HIIT- und Mobility-Kurse</li><li>Personal Training dienstags und donnerstags</li><li>Neu hier? Starte mit einer Einzelstunde und schau, wie es sich anfühlt.</li></ul>",
};

const es: Shape<typeof en> = {
  studioName: "Harbour Strength",
  upper: "Tren superior",
  upperDesc: "Empuje, tracción y core.",
  legs: "Día de piernas",
  legsDesc: "Sentadillas, zancadas, peso muerto.",
  hiit: "HIIT",
  hiitDesc: "Intervalos cortos e intensos.",
  mobility: "Movilidad",
  mobilityDesc: "Estiramientos y trabajo articular.",
  noteProgramme:
    "<h3>Tu bloque hasta Navidad</h3><ul><li><strong>2× fuerza</strong> (Tren superior + Día de piernas)</li><li><strong>1× HIIT</strong> para la condición física</li><li>Movilidad los sábados si puedes</li></ul><p>Volveremos a medir la sentadilla a mediados de diciembre.</p>",
  noteProgress:
    "<p>Gran progreso en la profundidad de tu sentadilla. Próximo objetivo: <strong>3×8 con 50 kg</strong>.</p>",
  noteHealth: "<p>Mencionó dolor en la rodilla izquierda en octubre. Vigilar zancadas y saltos al cajón.</p>",
  gender: "Mujer",
  customGoal: "Primera dominada",
  goalNotes:
    "<p>Quiere sentirse fuerte al cargar a sus hijos y hacer su <strong>primera dominada estricta</strong> antes del verano.</p>",
  trainingNotes:
    "<p>Lleva años corriendo de forma relajada; nueva en las pesas. Prefiere clases por la tarde; le gusta más la fuerza que el cardio.</p>",
  injuries: "<p>Rodilla izquierda: dolor leve en zancadas profundas. Sin dolor en sentadillas.</p>",
  goodwill: "Cortesía: clase cancelada con poca antelación",
  tagline: "Entrenamiento de fuerza en grupos pequeños en el centro de Oporto.",
  about:
    "<p>Somos un estudio pequeño con <strong>un máximo de 12 personas por clase</strong>, así que tu entrenadora conoce tu nombre, tus objetivos y tus rodillas.</p><ul><li>Clases de fuerza, HIIT y movilidad cada semana</li><li>Sesiones privadas los martes y jueves</li><li>¿Eres nuevo? Empieza con una clase suelta y mira qué tal.</li></ul>",
};

const fr: Shape<typeof en> = {
  studioName: "Harbour Strength",
  upper: "Haut du corps",
  upperDesc: "Poussée, tirage et gainage.",
  legs: "Jambes",
  legsDesc: "Squats, fentes, soulevés de terre.",
  hiit: "HIIT",
  hiitDesc: "Intervalles courts et intenses.",
  mobility: "Mobilité",
  mobilityDesc: "Étirements et travail articulaire.",
  noteProgramme:
    "<h3>Ton cycle jusqu'à Noël</h3><ul><li><strong>2× force</strong> (Haut du corps + Jambes)</li><li><strong>1× HIIT</strong> pour le cardio</li><li>Mobilité le samedi si tu peux</li></ul><p>On refait un test de squat mi-décembre.</p>",
  noteProgress:
    "<p>Beaux progrès sur la profondeur de ton squat. Prochain objectif : <strong>3×8 à 50 kg</strong>.</p>",
  noteHealth: "<p>A signalé une douleur au genou gauche en octobre. Surveiller les fentes et les box jumps.</p>",
  gender: "Femme",
  customGoal: "Première traction",
  goalNotes:
    "<p>Veut se sentir forte en portant ses enfants et réussir sa <strong>première traction stricte</strong> d'ici l'été.</p>",
  trainingNotes:
    "<p>Court tranquillement depuis des années, débute en musculation. Préfère les cours du soir ; aime plus la force que le cardio.</p>",
  injuries: "<p>Genou gauche : légère douleur sur les fentes profondes. Pas de douleur en squat.</p>",
  goodwill: "Geste commercial : cours annulé au dernier moment",
  tagline: "Renforcement musculaire en petits groupes au cœur de Porto.",
  about:
    "<p>Nous sommes un petit studio avec <strong>12 personnes maximum par cours</strong> : ta coach connaît ton prénom, tes objectifs et tes genoux.</p><ul><li>Des cours de force, de HIIT et de mobilité chaque semaine</li><li>Des séances privées le mardi et le jeudi</li><li>Nouveau ? Commence par un cours à l'unité pour voir.</li></ul>",
};

const pt: Shape<typeof en> = {
  studioName: "Harbour Strength",
  upper: "Parte superior",
  upperDesc: "Empurrar, puxar e core.",
  legs: "Dia de pernas",
  legsDesc: "Agachamentos, lunges, peso morto.",
  hiit: "HIIT",
  hiitDesc: "Intervalos curtos e intensos.",
  mobility: "Mobilidade",
  mobilityDesc: "Alongamentos e trabalho articular.",
  noteProgramme:
    "<h3>O teu bloco até ao Natal</h3><ul><li><strong>2× força</strong> (Parte superior + Dia de pernas)</li><li><strong>1× HIIT</strong> para a condição física</li><li>Mobilidade ao sábado, se puderes</li></ul><p>Voltamos a testar o agachamento a meio de dezembro.</p>",
  noteProgress:
    "<p>Ótimo progresso na profundidade do agachamento. Próximo objetivo: <strong>3×8 com 50 kg</strong>.</p>",
  noteHealth: "<p>Referiu dor no joelho esquerdo em outubro. Ter atenção aos lunges e box jumps.</p>",
  gender: "Feminino",
  customGoal: "Primeira elevação",
  goalNotes:
    "<p>Quer sentir-se forte a carregar os filhos e fazer a <strong>primeira elevação estrita</strong> até ao verão.</p>",
  trainingNotes:
    "<p>Corre descontraidamente há anos, nova no treino de força. Prefere aulas ao fim do dia; gosta mais de força do que de cardio.</p>",
  injuries: "<p>Joelho esquerdo: dor ligeira em lunges profundos. Sem dor nos agachamentos.</p>",
  goodwill: "Cortesia: aula cancelada em cima da hora",
  tagline: "Treino de força em pequenos grupos no coração do Porto.",
  about:
    "<p>Somos um estúdio pequeno com <strong>no máximo 12 pessoas por aula</strong>, por isso a tua treinadora sabe o teu nome, os teus objetivos e como estão os teus joelhos.</p><ul><li>Aulas de força, HIIT e mobilidade todas as semanas</li><li>Sessões privadas às terças e quintas</li><li>És novo por cá? Começa com uma aula avulsa e experimenta.</li></ul>",
};

export default { en, de, es, fr, pt };
