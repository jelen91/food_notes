export type LandingGuide = {
  title: string;
  intro: string;
  sections: {
    id: string;
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }[];
  questions: { q: string; a: string }[];
  sources: { label: string; url: string }[];
};

/** Praktický redakční obsah. Zdroje nepředstavují odbornou garanci aplikace. */
export const LANDING_GUIDES: Record<string, LandingGuide> = {
  traveni: {
    title: 'Potíže s trávením: co sledovat při nadýmání a bolesti břicha po jídle',
    intro:
      'Nafouklé břicho, tlak po obědě nebo opakované zažívací potíže mohou mít různé příčiny. Samotné poslední jídlo nemusí vysvětlit celý příběh. Užitečný začátek je popsat, co přesně cítíte, kdy to přichází a co tomu předcházelo. S takovým přehledem se další krok hledá lépe než ze vzpomínek.',
    sections: [
      {
        id: 'souvislosti-traveni',
        title: 'Proč se nedívat jen na jednu potravinu',
        paragraphs: [
          'Nadýmání může souviset například s plynem ve střevech, polykáním vzduchu při jídle nebo zácpou. Za opakovanými potížemi mohou stát i onemocnění, která vyžadují vyšetření. Podobné pocity proto nejsou automaticky důkazem potravinové intolerance.',
          'Pro vlastní pozorování je užitečné zachytit také porci, nápoje, čas a okolnosti jídla. Pokud bylo jednoho dne nadýmání po obědě a zároveň jste málo spali a jedli ve spěchu, samotný zápis „těstoviny“ mnoho neřekne. Deník pomůže tyto okolnosti zachovat pohromadě; neurčí, která z nich potíže způsobila.',
        ],
      },
      {
        id: 'denik-traveni',
        title: 'Jak vést potravinový deník při zažívacích potížích',
        paragraphs: [
          'Zapisujte průběžně a používejte podobný způsob hodnocení každý den. Místo „bylo mi špatně“ pomůže „tlak v břiše, začátek ve 14 hodin, intenzita 4 z 10“. Nemusíte popsat každou minutu: důležitá je pravidelnost a detaily, které zvládnete zachytit i zítra.',
          'Zaznamenejte také dny, kdy stejné jídlo provázelo dobré trávení. Právě ty umožňují porovnání. Rozumím tělu vám z vašich potřeb navrhne vlastní podobu deníku a AI přehled později upozorní na opakování i chybějící údaje.',
        ],
        bullets: [
          'Jídlo a pití: čas, složení a přibližná velikost porce.',
          'Potíže: místo, začátek, trvání a intenzita; případně změny stolice.',
          'Kontext: spánek, stres, spěch při jídle a užívané léky.',
        ],
      },
      {
        id: 'traveni-kdy-k-lekari',
        title: 'Kdy s bolestí břicha nebo nadýmáním k lékaři',
        paragraphs: [
          'Opakované nebo přetrvávající potíže proberte s lékařem, zvlášť pokud se zhoršují nebo nechtěně hubnete. Na dokončení deníku ani AI přehled nemusíte čekat; vezměte s sebou záznamy, které už máte.',
          'Náhlá silná bolest břicha, zvracení krve nebo černá dehtovitá stolice vyžadují neodkladnou lékařskou pomoc. Deník v takové situaci není dalším krokem.',
        ],
      },
    ],
    questions: [
      {
        q: 'Proč mě bolí břicho po jídle?',
        a: 'Z načasování samotného příčinu nepoznáte. Důležité jsou i místo a charakter bolesti, její trvání a další příznaky. Opakující se bolest patří k lékařskému posouzení. Záznam jídla a průběhu bolesti vám pomůže zkušenost konkrétněji popsat.',
      },
      {
        q: 'Má smysl zapisovat i jídla, po kterých mi nic není?',
        a: 'Ano. Pokud zapisujete pouze nepříjemné epizody, nevidíte, kolikrát stejné jídlo proběhlo bez potíží. Záznamy dobrých dnů dávají jednotlivým shodám kontext a pomáhají vyhnout se ukvapenému závěru z jedné zkušenosti.',
      },
      {
        q: 'Je potravinový deník zároveň jídelníček nebo dieta?',
        a: 'Ne. Zachycuje to, co skutečně jíte a prožíváte. Rozumím tělu vám nepředepisuje dietu. Případné změny kvůli podezření na onemocnění nebo intoleranci řešte s lékařem, nikoli jen podle shody v záznamech.',
      },
    ],
    sources: [
      { label: 'NHS: nadýmání — projevy a kdy vyhledat pomoc', url: 'https://www.nhs.uk/symptoms/bloating/' },
      { label: 'NHS: bolest břicha — varovné příznaky', url: 'https://www.nhs.uk/symptoms/stomach-ache/' },
    ],
  },
  migreny: {
    title: 'Migrény a časté bolesti hlavy: jak si vést užitečný deník',
    intro:
      'Když vás opakovaná bolest hlavy připravuje o běžný den, zpětně se těžko vybavuje každý detail. Deník bolestí hlavy umožňuje zachytit jejich četnost, průběh a dopad na váš život. Vytvoříte si přehled pro vlastní orientaci i rozhovor s lékařem, místo abyste při příští konzultaci začínali znovu odhadem.',
    sections: [
      {
        id: 'souvislosti-bolesti-hlavy',
        title: 'Bolest hlavy není vždy migréna',
        paragraphs: [
          'Migrénu mohou provázet nevolnost a citlivost na světlo či zvuk. Bolesti hlavy však mají různé podoby a samotný deník je nerozliší s jistotou. Pokud diagnózu nemáte, zapisujte vlastní příznaky tak, jak je cítíte, bez nutnosti je hned pojmenovat.',
          'Může vás napadnout souvislost se spánkem, náročným dnem nebo vynechaným jídlem. Je užitečné ji zaznamenat jako otázku. Opakování v několika zápisech je podnět k dalšímu pozorování; samo o sobě nepotvrzuje spouštěč. Zapisujte také dny, kdy podobné okolnosti bolest neprovázely.',
        ],
      },
      {
        id: 'denik-bolesti-hlavy',
        title: 'Co zapisovat do deníku migrény a bolestí hlavy',
        paragraphs: [
          'Pomáhá mít základní údaje pohromadě a hodnotit bolest pokaždé stejnou stupnicí. Vedle intenzity zachyťte i dopad: zda jste zvládli práci, museli přerušit aktivitu nebo si lehnout. To popisuje váš den lépe než samotné číslo.',
          'Rozumím tělu sestaví deník podle vašich odpovědí. Do poznámky můžete přidat neobvyklou okolnost; není třeba dopředu vědět, zda bude důležitá. AI přehled pak může vedle opakujících se pozorování ukázat také výjimky a otázky, na které zápisy zatím nestačí.',
        ],
        bullets: [
          'Kdy bolest začala a skončila, její intenzitu a místo.',
          'Doprovodné příznaky a omezení běžných aktivit.',
          'Užité léky včetně času a dávky; případně vztah k menstruaci.',
          'Spánek, jídlo a okolnosti dne, včetně dnů bez bolesti.',
        ],
      },
      {
        id: 'bolest-hlavy-kdy-k-lekari',
        title: 'Kdy bolest hlavy neřešit jen deníkem',
        paragraphs: [
          'Časté, zhoršující se nebo výrazně omezující bolesti proberte s lékařem. Změnu dosavadního průběhu popište zvlášť. Záznamy užitých léků mohou při konzultaci pomoci; dávkování podle AI přehledu neměňte.',
          'Při náhlé extrémně silné bolesti hlavy nebo bolesti s novou poruchou řeči, slabostí končetiny či zmateností vyhledejte neodkladnou pomoc. Nečekejte na další zápis nebo dokončení pozorování.',
        ],
      },
    ],
    questions: [
      {
        q: 'Jak dlouho vést deník bolestí hlavy?',
        a: 'NICE doporučuje při použití deníku k posouzení bolestí hlavy zaznamenávat alespoň 8 týdnů. Vhodnou dobu pro váš případ domluvte s lékařem. Odemčení AI přehledu v aplikaci neurčuje délku pozorování potřebnou pro zdravotní posouzení.',
      },
      {
        q: 'Co si poznamenat, když při migréně nezvládám zapisovat?',
        a: 'Až budete moci, zachyťte přibližný začátek, konec, příznaky a užité léky. Uveďte, že jde o zpětný odhad. Krátký pravdivý zápis je užitečnější než doplnění přesných časů, kterými si nejste jistí.',
      },
      {
        q: 'K čemu je deník, když už mám migrénu diagnostikovanou?',
        a: 'Můžete mít přehled o dnech s bolestí, užití léků a dopadu na běžné činnosti. Při kontrole pak snáze popíšete, co se oproti předchozímu období změnilo. Další postup a hodnocení léčby patří lékaři.',
      },
    ],
    sources: [
      { label: 'NICE CG150: vedení deníku bolestí hlavy, doporučení 1.1.3–1.1.4', url: 'https://www.nice.org.uk/guidance/cg150/chapter/Recommendations' },
      { label: 'NHS: migréna — příznaky a kdy vyhledat pomoc', url: 'https://www.nhs.uk/conditions/migraine/' },
    ],
  },
  unava: {
    title: 'Dlouhodobá únava a nedostatek energie: čeho si všímat',
    intro:
      'Jestli jste pořád unavení, pomůže rozlišit, jak únava vypadá právě u vás: přichází ráno, po obědě, nebo až po zátěži? Trvá několik hodin, či celý den? Konkrétní popis může usnadnit rozhovor s lékařem a zachytit změny, které v paměti snadno splynou v jeden dlouhý náročný týden.',
    sections: [
      {
        id: 'souvislosti-unavy',
        title: 'Proč dlouhodobou únavu nelze vysvětlit jedním číslem',
        paragraphs: [
          'Na únavě se může podílet nedostatek spánku, psychická zátěž, některé léky i zdravotní potíže. Ani dostatek hodin v posteli tedy sám nevysvětlí, proč se necítíte odpočatě. Pokud únava trvá nebo vás omezuje, příčinu má posoudit lékař.',
          'V deníku můžete oddělit ospalost, tělesné vyčerpání a potíže se soustředěním. Přidejte, kdy jste si jich všimli a co vám ztížily. Takový popis je konkrétnější než „dnes energie 3 z 10“ a pomáhá pochopit, co stejné číslo znamená ve vašem běžném životě.',
        ],
      },
      {
        id: 'denik-unavy',
        title: 'Jak sledovat energii, spánek a zátěž během dne',
        paragraphs: [
          'Zvolte si několik srovnatelných okamžiků, například ráno a odpoledne. Zapisujte podobně i ve dnech, kdy se cítíte lépe. Nemusíte sledovat všechno: začněte údaji, které mají vztah k vaší otázce a jejichž zapisování vás zbytečně nevyčerpává.',
          'Rozumím tělu vám pomůže navrhnout vlastní deník. Záznam může vypadat třeba takto: „Ráno únava 6 z 10, dvě probuzení v noci, cestu do práce jsem zvládl, odpoledne jsem zrušil procházku.“ AI přehled později uspořádá vaše pozorování; z jednotlivé shody neurčí příčinu únavy.',
        ],
        bullets: [
          'Spánek: přibližný čas usnutí a vstávání, probuzení a pocit po ránu.',
          'Energii a soustředění v podobnou dobu, včetně dopadu na běžné činnosti.',
          'Aktivity, odpočinek, stres, jídlo, pití a užívané léky.',
          'Případné zhoršení po aktivitě, i když přichází až následující den.',
        ],
      },
      {
        id: 'unava-kdy-k-lekari',
        title: 'Kdy s únavou k lékaři',
        paragraphs: [
          'Objednejte se, pokud nevysvětlená únava trvá několik týdnů, nelepší se nebo zasahuje do každodenního života. Lékaři řekněte také o dalších potížích, například nechtěném hubnutí nebo hlasitém chrápání a lapání po dechu ve spánku.',
          'Pokud se stav po námaze výrazně zhoršuje se zpožděním, tuto okolnost zvlášť popište. Neberte deník jako výzvu k překonávání únavy ani nečekejte na odemčení AI přehledu, abyste mohli požádat o pomoc.',
        ],
      },
    ],
    questions: [
      {
        q: 'Proč jsem unavený, i když spím dost?',
        a: 'Délka spánku je jen část informace. Roli může mít jeho kvalita i jiné okolnosti nebo zdravotní potíže. Zaznamenejte probuzení, ranní stav a průběh dne; pokud únava přetrvává, proberte ji s lékařem.',
      },
      {
        q: 'Co zapisovat při únavě po jídle?',
        a: 'Zachyťte čas jídla, jeho složení a přibližnou porci, začátek útlumu a jeho délku. Přidejte předchozí spánek i další okolnosti. Časová návaznost sama nedokazuje, že únavu způsobila konkrétní potravina.',
      },
      {
        q: 'Jak připravit přehled únavy pro lékaře?',
        a: 'Shrňte, odkdy únava trvá, kdy během dne přichází, co už kvůli ní nezvládáte a které další příznaky se objevují. Přidejte informace o spánku, užívaných lécích a změnách po zátěži. Vezměte i neúplné záznamy; není nutné čekat na dokonalý deník.',
      },
    ],
    sources: [
      { label: 'NHS: únava — možné souvislosti a kdy navštívit lékaře', url: 'https://www.nhs.uk/symptoms/tiredness-and-fatigue/' },
      { label: 'NZIP: únava — co lékaře zajímá při rozhovoru', url: 'https://www.nzip.cz/rejstrikovy-pojem/55' },
      { label: 'NHS: ME/CFS — zhoršení příznaků po aktivitě', url: 'https://www.nhs.uk/conditions/chronic-fatigue-syndrome-cfs/symptoms/' },
    ],
  },
};
