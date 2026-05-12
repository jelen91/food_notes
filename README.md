# Food Notes

Jednoduchá aplikace pro mobilní použití: každý den samostatná poznámka o jídle. Data se ukládají do MongoDB.

## Co je hotové

- `pages/index.tsx` – React komponenta pro mobilní UI
- `pages/api/notes.ts` – API pro ukládání denních poznámek
- `pages/api/report.ts` – API pro report všech dnů

## Funkce

- otevřeš appku a vybereš datum (defaultně dnes)
- napíšeš, co jsi měl ke snídani / obědu / večeři
- klikneš `Uložit` a poznámka se uloží do databáze
- každý den je uložen zvlášť
- v reportu můžeš kliknout `Upravit` a otevřít dřívější den pro úpravu
- klikneš `Zobrazit report všech dnů` a uvidíš všechny uložené dny

## Instalace

1. `npm install`
2. Vytvoř `.env.local` s `MONGODB_URI`
3. `npm run dev` pro development

## Deployment na Vercel

1. Pushni kód na GitHub
2. Připoj projekt na Vercel (vercel.com)
3. V nastavení projektu přidej environment variable:
   - `MONGODB_URI` = tvůj MongoDB Atlas connection string
4. Deploy

Next.js je optimalizované pro Vercel.

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/food_notes?retryWrites=true&w=majority
PORT=4000
```

## Deployment na Vercel

1. Pushni kód na GitHub
2. Připoj projekt na Vercel (vercel.com)
3. V nastavení projektu přidej environment variable:
   - `MONGODB_URI` = tvůj MongoDB Atlas connection string
4. Deploy

Vercel automaticky rozpozná `vercel.json` a `api/` složku pro serverless functions.
