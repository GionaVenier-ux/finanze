# Finanze

Web app minimal per iPhone: saldi (carta, contanti, investiti), spese, entrate, trasferimenti, ricorrenze e statistiche.
I dati restano solo sul telefono (nessun server, nessun account).

## Pubblicarla su GitHub Pages

1. Vai su github.com, accedi e crea un nuovo repository **pubblico** (es. `finanze`). Non aggiungere README.
2. Nella pagina del repository: **Add file → Upload files**, trascina questi file e la cartella:
   `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`
   poi premi **Commit changes**.
3. **Settings → Pages** → in *Branch* scegli `main` e cartella `/ (root)` → **Save**.
4. Dopo 1–2 minuti l'app è online su `https://TUO-NOME.github.io/finanze/`.

## Installarla sull'iPhone

1. Apri il link con **Safari**.
2. Tocca **Condividi** → **Aggiungi alla schermata Home**.
3. Usa sempre l'icona sulla Home: i dati dell'app installata sono separati da quelli della scheda di Safari.

## Backup

I dati vivono solo nel telefono. Ogni tanto vai in **Altro → Esporta backup** e salva il file su File/iCloud Drive.
Per recuperarli: **Altro → Ripristina da backup**.

## Aggiornare l'app

Dopo aver modificato i file, aumenta la versione in `sw.js` (`finanze-v1` → `finanze-v2`) e ricarica i file su GitHub.
Sull'iPhone l'aggiornamento arriva alla seconda apertura dell'app.
