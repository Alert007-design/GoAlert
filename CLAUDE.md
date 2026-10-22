<!-- FASTE REGLER START -->
## Planen ligger i filer, så en ny session kan fortsætte
Ved enhver større funktion oprettes mappen `plan/` i repoet med tre filer:
- `plan/SPEC.md` – hvad funktionen skal kunne, skrevet på dansk, før der
  skrives kode. Jeg godkender den først.
- `plan/OPGAVER.md` – specifikationen brudt ned i små opgaver i rækkefølge,
  med en afkrydsning [ ] foran hver. Hver opgave skal kunne bygges og
  kontrolleres for sig.
- `plan/STATUS.md` – tre linjer: hvad der er færdigt, hvad der er i gang,
  og hvad der mangler. Opdateres hver gang en opgave er færdig.
Byg én opgave ad gangen. Afkryds den i OPGAVER.md, når den er bygget og
kontrolleret (typecheck, lint, build; tests i cloud-sessionen). Start altid
en ny session med at læse plan/STATUS.md og plan/OPGAVER.md og fortsæt, hvor
den forrige slap. Når funktionen er helt færdig og pushet, slettes mappen.

## Sprog i alt, der vises for mennesker
Alt, der kan læses af andre end mig – tekster på sider, knapper,
fejlmeddelelser, mails, nyhedsbreve, opslag – skrives på korrekt, naturligt
dansk. Det må ikke kunne ses, at en AI har været med. Derfor:
- Ingen opremsninger i tre for rytmens skyld. Skriv det antal, der er.
- Ingen "ikke blot X, men Y"-konstruktioner.
- Ingen hype-ord: banebrydende, revolutionerende, sømløs, kraftfuld,
  effektiv (som fyldord), i dag mere end nogensinde, i en verden hvor.
- Ingen afslutninger af typen "Klar til at komme i gang?" eller "Lad os".
- Ingen lange tankestreger (—). Brug kort tankestreg med mellemrum ( – ),
  og brug den sjældent.
- Ingen overskrifter, der er spørgsmål, og ingen punktopstillinger i tekst,
  der skal læses som almindelig prosa.
- Ingen anglicismer: "dykke ned i", "italesætte", "navigere" (om andet end
  skibe), "udfordring" i stedet for problem, "tage ejerskab".
- Variér sætningslængden. En lang sætning må gerne følges af en helt kort.
- Konkrete tal og navne frem for "mange", "en række", "diverse".
- Teknisk tekst (kode, kommentarer, commits) må være kort og nøgtern, men
  stadig dansk.
<!-- FASTE REGLER SLUT -->
