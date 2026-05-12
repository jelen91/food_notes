# Food Notes

Jednoduchá aplikace pro mobilní použití: každý den samostatná poznámka o jídle. Data se ukládají do MongoDB.

## Co je hotové

- `backend/server.ts` – Express API pro ukládání denních poznámek
- `public/index.html` – jednoduché webové mobilní UI
- `public/app.js` – logika pro načtení/přepis poznámek a zobrazení reportu
- `public/styles.css` – responzivní styl pro telefon

## Funkce

- otevřeš appku a vybereš datum (defaultně dnes)
- napíšeš, co jsi měl ke snídani / obědu / večeři
- klikneš `Uložit` a poznámka se uloží do databáze
- každý den je uložen zvlášť
- v reportu můžeš kliknout `Upravit` a otevřít dřívější den pro úpravu
- klikneš `Zobrazit report všech dnů` a uvidíš všechny uložené dny

## Instalace

1. V kořenovém adresáři spusť:

```bash
npm install
```

2. Vytvoř soubor `backend/.env` podle `backend/.env.example`.

3. Založ zdarma MongoDB Atlas cluster a získej connection string.

4. Spusť aplikaci:

```bash
npm run dev
```

5. Otevři prohlížeč na `http://localhost:4000`.

## MongoDB Atlas (free)

- Zaregistruj se na https://www.mongodb.com/atlas
- Vytvoř nový cluster (Free Tier)
- Vytvoř databázového uživatele a povol přístup z tvé IP
- Zkopíruj `MONGODB_URI` do `backend/.env`
- `MONGODB_URI` musí obsahovat tvé `username:password`, jinak Atlas odmítne připojení

## Příklad `backend/.env`

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
