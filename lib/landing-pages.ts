import { BRAND, brandTitle } from './brand';

/** Obsah kampaní na jednom místě. Žádná z tématických stránek neurčuje diagnózu. */
export interface LandingPageContent {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  eyebrow: string;
  headline: string;
  emphasis: string;
  lead: string;
  story: {
    eyebrow: string;
    title: string;
    paragraphs: string[];
    recognitions: string[];
    turn: string;
  };
  questionnairePrompt: string;
  demo: {
    label: string;
    scale: string;
    entries: { time: string; label: string; note: string; icon: 'food' | 'moon' | 'note' }[];
  };
  analysisDemo: {
    title: string;
    observation: string;
    evidence: string;
    uncertainty: string;
    nextStep: string;
    doctorQuestion: string;
  };
  focus: string[];
  question: string;
  answer: string;
}

export const LANDING_PAGES: LandingPageContent[] = [
  {
    slug: 'traveni',
    title: 'Trávení a nadýmání',
    metaTitle: brandTitle('Zase potíže po jídle? Najděte svůj další krok'),
    description:
      'Trávení vás trápí a už nevíte, co dál? Získejte AI deník na míru a osobní vyhodnocení, které vám pomůže hledat souvislosti a vlastní směr k úlevě.',
    eyebrow: 'KDYŽ UŽ CHCETE VĚDĚT, ČEHO SE CHYTIT',
    headline: 'Zase potíže po jídle?',
    emphasis: 'Najděte svůj směr k úlevě.',
    lead: 'Už nevíte, co jíst a co změnit, abyste se cítili lépe? AI vám sestaví deník podle vašich potíží. Společně v něm zachytíte jídlo, režim i to, jak vám je. Osobní AI vyhodnocení pak pomůže najít souvislosti a konkrétní směr, který stojí za prozkoumání.',
    story: {
      eyebrow: 'MOŽNÁ TO ZNÁTE',
      title: 'Je těžké něco změnit, když nevíte, čeho se chytit.',
      paragraphs: [
        'Jednou stejné jídlo zvládnete bez potíží, jindy vám po něm není dobře. Přemýšlíte, čím to mohlo být. Jenže vybavit si zpětně všechno, co jste jedli, jak jste spali a co se ten den dělo, je těžké.',
        'Právě vaše každodenní zkušenost může přinést užitečné vodítko. V deníku dáte vedle sebe jídlo, okolnosti a průběh potíží. AI vám pak pomůže hledat, co se opakuje a čemu věnovat pozornost při hledání úlevy.',
      ],
      recognitions: [
        'Vybíráte si jídlo a v hlavě vám běží: „Jak mi po něm asi bude?“',
        'Potíže se vracejí, ale nedokážete říct, co mají jednotlivé dny společného.',
        'Když je vám lépe, přejete si vědět, co bylo tentokrát jinak.',
      ],
      turn: 'Udělejte pro sebe konkrétní krok. Začněte zachycovat vlastní zkušenost a získejte osobní přehled, o který můžete opřít další rozhodování.',
    },
    questionnairePrompt: 'Chci sledovat, jak se moje trávení mění v souvislosti s jídlem a denním režimem.',
    demo: {
      label: 'Můj deník trávení',
      scale: 'Pocit nadýmání',
      entries: [
        { time: '08:00', label: 'Snídaně', note: 'Ovesná kaše, banán, čaj.', icon: 'food' },
        { time: '12:30', label: 'Oběd', note: 'Rýže, zelenina, kuře.', icon: 'food' },
        {
          time: '14:15',
          label: 'Moje pozorování',
          note: 'Mírné nadýmání. Dnes jsem jedl ve spěchu.',
          icon: 'note',
        },
      ],
    },
    analysisDemo: {
      title: 'Jídlo ve spěchu stojí za další pozorování',
      observation:
        'Nadýmání se objevilo ve 4 z 5 dnů se zápisem „jídlo ve spěchu“. V ostatních 16 dnech bylo zaznamenáno 3krát.',
      evidence:
        'Shoda v zápisech 4., 9., 13. a 19. září. Dne 7. září bylo jídlo ve spěchu bez zaznamenaného nadýmání.',
      uncertainty:
        'To neprokazuje příčinu. Ve třech z těchto dnů byl také vyšší stres; chybí údaje o velikosti porcí.',
      nextStep:
        'Dál zapisujte čas jídla, přibližnou porci, spěch, stres a začátek potíží. Zachyťte i dny bez nadýmání.',
      doctorQuestion: 'Které další údaje o průběhu trávení má v mém případě smysl sledovat?',
    },
    focus: ['Jídlo a čas jídla', 'Vlastní pozorování trávení', 'Spánek a denní režim'],
    question: 'Pozná deník potravinovou intoleranci?',
    answer:
      'Ne. Deník zachytí vaše záznamy, ale nepotvrdí intoleranci ani příčinu potíží. Opakující se souvislost je podnět k rozhovoru s lékařem, nikoli důvod k automatickému vyřazování potravin.',
  },
  {
    slug: 'migreny',
    title: 'Migrény a bolesti hlavy',
    metaTitle: brandTitle('Migrény se vracejí? Hledejte svůj další krok'),
    description:
      'Bolest hlavy vám znovu mění plány? S AI deníkem na míru a osobním vyhodnocením hledejte souvislosti a konkrétní směr, kterému se věnovat dál.',
    eyebrow: 'PRO VÁŠ DALŠÍ KROK K LEPŠÍM DNŮM',
    headline: 'Bolest vám zase mění plány?',
    emphasis: 'Pojďte hledat, co může pomoci.',
    lead: 'Když se bolest vrací, chcete vědět, co s tím můžete dělat. AI vám sestaví deník, který zachytí její průběh i okolnosti vašich dnů. Z vašich zápisů pak připraví osobní vyhodnocení: možné souvislosti, čemu se věnovat dál a co probrat s lékařem.',
    story: {
      eyebrow: 'MOŽNÁ TO ZNÁTE',
      title: 'Za každou bolestí je i den, který jste chtěli prožít jinak.',
      paragraphs: [
        'Máte plány, práci, čas pro své blízké. Pak přijde bolest a všechno se přizpůsobuje jí. Když ustoupí, zbývá otázka: co jí tentokrát předcházelo a čeho si příště všimnout?',
        'Váš den má mnohem víc detailů, než si dokážete vybavit při příští konzultaci. Když průběžně zachytíte spánek, režim i průběh bolesti, vytvoříte vlastní podrobný obraz. AI v něm pomůže hledat vodítka pro další pozorování a rozhovor s lékařem.',
      ],
      recognitions: [
        'Rušíte něco, na co jste se těšili, protože dnes to s bolestí nejde.',
        'Zkoušíte si vybavit, co bylo před bolestí jinak, ale jednotlivé dny splývají.',
        'Při konzultaci si nevzpomenete přesně, kdy bolest přišla, jak dlouho trvala a co jí předcházelo.',
      ],
      turn: 'Začněte tím, co můžete ovlivnit dnes: zachyťte svou zkušenost. Osobní přehled vám pomůže hledat smysluplný další krok.',
    },
    questionnairePrompt:
      'Chci zaznamenávat průběh bolestí hlavy a sledovat jejich možné souvislosti se spánkem a denním režimem.',
    demo: {
      label: 'Můj deník bolestí hlavy',
      scale: 'Intenzita bolesti',
      entries: [
        { time: '07:30', label: 'Spánek', note: 'Asi 6 hodin, dvakrát jsem se probudil.', icon: 'moon' },
        {
          time: '13:00',
          label: 'Začátek bolesti',
          note: 'Tlak na levé straně, citlivost na světlo.',
          icon: 'note',
        },
        {
          time: '15:30',
          label: 'Moje pozorování',
          note: 'Bolest ustupuje. Dnes náročné dopoledne.',
          icon: 'note',
        },
      ],
    },
    analysisDemo: {
      title: 'Kratší spánek se opakuje vedle bolesti',
      observation:
        'Bolest hlavy byla zapsána ve 4 z 5 dnů po spánku kratším než 6 hodin. V ostatních 16 dnech byla zaznamenána 3krát.',
      evidence:
        'Shoda v zápisech 4., 9., 13. a 19. září. Dne 7. září byl krátký spánek bez zaznamenané bolesti.',
      uncertainty:
        'Krátký spánek tím není potvrzený spouštěč. Ve třech z těchto dnů byl i vyšší stres a neznáme všechny okolnosti.',
      nextStep: 'Dál zapisujte délku a kvalitu spánku, stres, začátek a trvání bolesti i dny bez bolesti.',
      doctorQuestion: 'Jak dlouhé pozorování a které údaje o bolestech hlavy by pro vás byly nejužitečnější?',
    },
    focus: ['Čas a trvání bolesti', 'Intenzita a vlastní poznámky', 'Spánek a okolnosti dne'],
    question: 'Pomůže deník určit spouštěč migrény?',
    answer:
      'Může usnadnit sledování možných souvislostí, ale nedokazuje příčinu a nenavrhuje léčbu. Přehled svých pozorování můžete probrat s lékařem. Nová náhlá silná bolest hlavy patří k neodkladnému lékařskému posouzení.',
  },
  {
    slug: 'unava',
    title: 'Únava a energie',
    metaTitle: brandTitle('Chybí vám energie? Najděte svůj další krok'),
    description:
      'Chcete mít zase energii na to, na čem vám záleží? AI deník na míru a osobní vyhodnocení vám pomohou hledat souvislosti a konkrétní další krok.',
    eyebrow: 'ABYSTE MĚLI OD ČEHO SE ODRAZIT',
    headline: 'Chcete mít zase víc energie?',
    emphasis: 'Najděte, čemu se věnovat dál.',
    lead: 'Na práci ještě sílu najdete. Na věci, které máte rádi, už často nezbývá. AI vám sestaví deník podle toho, co prožíváte. Zachytíte energii, spánek i okolnosti dne a získáte osobní vyhodnocení, které pomůže hledat, co může souviset s lepšími i horšími dny.',
    story: {
      eyebrow: 'MOŽNÁ TO ZNÁTE',
      title: 'Chcete mít sílu i na to, co vám dělá radost.',
      paragraphs: [
        'Den nějak zvládnete. Ale na procházku, koníček nebo večer s přáteli už energie nezbývá. Někdy je vám lépe a přemýšlíte, co se změnilo. Rádi byste se měli od čeho odrazit.',
        'Únava není každý den stejná. Vlastní záznamy vám pomohou zachytit rozdíly, které zpětně snadno zapadnou. AI dá vaše pozorování vedle sebe a pomůže hledat, čemu věnovat pozornost a které otázky otevřít při konzultaci.',
      ],
      recognitions: [
        'Odpočinete si, ale pořád nevíte, proč se některé dny cítíte tak vyčerpaně.',
        'Odkládáte věci, na kterých vám záleží, až „budete mít víc energie“.',
        'Lepší den vás potěší — jen si nejste jistí, co bylo tentokrát jinak.',
      ],
      turn: 'Věnujte pozornost tomu, jak vám skutečně je. Z vlastních zkušeností si vytvořte přehled, který vám pomůže rozhodnout, kudy dál.',
    },
    questionnairePrompt: 'Chci sledovat změny energie během dne v kontextu spánku, jídla a aktivit.',
    demo: {
      label: 'Můj deník energie',
      scale: 'Míra únavy',
      entries: [
        { time: '07:00', label: 'Spánek', note: '7 hodin. Ráno se cítím odpočatě.', icon: 'moon' },
        { time: '12:15', label: 'Oběd', note: 'Těstoviny se zeleninou.', icon: 'food' },
        { time: '15:00', label: 'Moje pozorování', note: 'Odpolední útlum, menší než včera.', icon: 'note' },
      ],
    },
    analysisDemo: {
      title: 'Odpolední únava a krátký spánek se potkávají',
      observation:
        'Výraznější odpolední únava byla zapsána ve 4 z 5 dnů po spánku kratším než 6 hodin. V ostatních 16 dnech se objevila 3krát.',
      evidence:
        'Shoda v zápisech 4., 9., 13. a 19. září. Dne 7. září byl krátký spánek bez výraznější únavy.',
      uncertainty:
        'Příčinu únavy z toho nelze určit. Ve třech z těchto dnů byla i vyšší pracovní zátěž; část zápisů o aktivitě chybí.',
      nextStep: 'Dál zapisujte energii ve srovnatelnou denní dobu, délku spánku a pracovní i fyzickou zátěž.',
      doctorQuestion: 'Co dalšího potřebujete vědět o průběhu mé únavy a jejím dopadu na běžný den?',
    },
    focus: ['Energie během dne', 'Spánek a odpočinek', 'Jídlo, pohyb a aktivity'],
    question: 'Zjistí deník, proč jsem unavený?',
    answer:
      'Deník neposkytuje diagnózu. Umožní vám sledovat vlastní pozorování a připravit přehled pro konzultaci. Dlouhodobou nevysvětlenou únavu nebo únavu zasahující do běžného života řešte s lékařem.',
  },
];

export const HOME_CONTENT: LandingPageContent = {
  ...LANDING_PAGES[0],
  slug: '',
  title: BRAND.name,
  metaTitle: brandTitle('Osobní AI deník a souvislosti vašich potíží'),
  description:
    'Potíže vás omezují a už nevíte, co dál? AI deník na míru a osobní vyhodnocení vám pomohou hledat souvislosti a vlastní směr k tomu, aby vám bylo lépe.',
  eyebrow: 'VAŠE TĚLO. VÁŠ PŘÍBĚH. VAŠE SOUVISLOSTI.',
  headline: 'Co vám tělo říká?',
  emphasis: 'Začněte mu rozumět.',
  lead: 'Potíže se vracejí a vy už nevíte, co změnit? Rozumím tělu propojí to, co jíte, jak spíte a jak vám je, v osobním deníku sestaveném pomocí AI. Z vašich záznamů pak připraví přehled možných souvislostí a podnětů, o které můžete opřít svůj další krok.',
  story: {
    eyebrow: 'MOŽNÁ TO ZNÁTE',
    title: 'Nejtěžší je chtít něco změnit a nevědět, kde začít.',
    paragraphs: [
      'Jeden den je vám lépe, druhý hůř. Čtete rady, přemýšlíte, co změnit, a snažíte se vypozorovat, co funguje právě u vás. Jenže když se ohlédnete zpátky, jednotlivé dny i jejich okolnosti splývají.',
      'Vaše každodenní zkušenost si zaslouží pozornost. Když zachytíte, co jíte, jak spíte, co děláte a jak vám je, vznikne osobní obraz vašich dnů. AI vám pomůže vybrat, co má smysl sledovat, a hledat v zápisech vodítka pro další postup.',
    ],
    recognitions: [
      'Máte pocit, že něco může hrát roli, ale zatím se nemáte o co opřít.',
      'Obecné rady čtete snadno. Těžší je poznat, které dávají smysl právě pro vás.',
      'Chcete udělat něco konkrétního pro to, aby vám bylo lépe.',
    ],
    turn: 'Vezměte hledání dalšího kroku do vlastních rukou. S osobním deníkem a AI vyhodnocením získáte nové podněty vycházející z toho, co skutečně prožíváte.',
  },
  questionnairePrompt: '',
};

export function getLandingPage(slug: unknown): LandingPageContent | undefined {
  return typeof slug === 'string' ? LANDING_PAGES.find((page) => page.slug === slug) : undefined;
}

export function questionnaireHref(slug: string): string {
  return getLandingPage(slug) ? `/dotaznik?tema=${slug}` : '/dotaznik';
}
