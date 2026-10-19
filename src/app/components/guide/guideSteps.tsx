import { groupDisplayName } from '../../../shared/groups';
import {
  ArtGenerate,
  ArtInstall,
  ArtLog,
  ArtRecipe,
  ArtRedo,
  ArtSettings,
  ArtShare,
  ArtShopping,
  ArtWelcome,
} from './GuideArt';

export type GuideStep = {
  id: string;
  /** 小見出し（どの画面の話か） */
  eyebrow: string;
  title: string;
  lead: string;
  points: React.ReactNode[];
  /** 画面のどこにあるか */
  where?: string;
  art: React.ReactNode;
};

/** ホーム画面に追加する手順は端末ごとに違う */
function installPoints(): React.ReactNode[] {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (standalone) {
    return [
      <>
        いまは<b>ホーム画面から開いています</b>。このまま使えます。
      </>,
      '電波が弱い売り場でも、前に開いた献立や買い物リストを表示できます。',
      'オフラインでつけたチェックは、電波が戻ると自動で保存されます。',
    ];
  }
  const ios = /iPhone|iPad|iPod/.test(ua);
  return [
    ios ? (
      <>
        Safari の下にある<b>共有ボタン（四角から上向きの矢印）</b>を押し、
        <b>「ホーム画面に追加」</b>を選びます。
      </>
    ) : (
      <>
        Chrome の右上の<b>メニュー（︙）</b>から<b>「ホーム画面に追加」</b>または
        <b>「アプリをインストール」</b>を選びます。
      </>
    ),
    'アイコンから開くと、アドレスバーのない全画面で使えます。',
    '電波が弱い売り場でも、前に開いた献立や買い物リストを表示できます。オフラインでつけたチェックは、電波が戻ると自動で保存されます。',
  ];
}

export function buildGuideSteps({ joinedGroup }: { joinedGroup?: string | null }): GuideStep[] {
  const steps: GuideStep[] = [];

  if (joinedGroup) {
    steps.push({
      id: 'welcome',
      eyebrow: 'ようこそ',
      title: `${groupDisplayName(joinedGroup)}に参加しました`,
      lead: '献立・買い物リスト・レシピ・自炊記録は、このグループのみんなで共有されます。',
      points: [
        'すでに作ってある献立は、そのまま見たり作り直したりできます。',
        'だれかが献立を変えると、ほかの人の画面にもすぐ反映され、お知らせが出ます。',
        'このあと、主な機能を順番に紹介します。',
      ],
      art: <ArtWelcome groupName={groupDisplayName(joinedGroup)} />,
    });
  }

  steps.push(
    {
      id: 'generate',
      eyebrow: '1. 献立を作る',
      title: 'ボタン1つで1週間分',
      lead: '「週間献立」のボタンを押すと、月曜〜日曜の主菜・汁物・副菜をまとめて作ります。',
      points: [
        '直近に食べた料理や、前後の日と同じ主材料（鶏肉が続く など）は出にくくしています。',
        '汁物と副菜は、主菜と同じ和・洋・中から選ばれやすくなっています。',
        '料理をタップすると、材料・手順・コツを見られます。人数に合わせて分量も変わります。',
        <>
          ホームには<b>「今日のごはん」</b>が表示されます。
        </>,
      ],
      where: '下のタブ「週間献立」',
      art: <ArtGenerate />,
    },
    {
      id: 'settings',
      eyebrow: '2. 献立の設定',
      title: '家庭に合わせて細かく調整',
      lead: '「週間献立」の右上の歯車から、献立の作り方を変えられます。設定はグループで共有されます。',
      points: [
        <>
          <b>和・洋・中の割合</b>：スライダーで、和食多めなどに調整できます。
        </>,
        <>
          <b>1週間の予算</b>：超えそうなときは、高い料理を安い料理に入れ替えます。
        </>,
        <>
          <b>曜日ごとの設定</b>：予算（節約・標準・ゆとり）、料理時間（時短・ほどよく・じっくり）、
          副菜（自動・あり・なし）を曜日ごとに決められます。
        </>,
        <>
          <b>料理レベル</b>：🌱 は手順が少なく失敗しにくい料理、🌾 はいつもの料理。 「平日は
          🌱、週末は 🌾」のようにも決められます。
        </>,
      ],
      where: '週間献立 → 右上の歯車',
      art: <ArtSettings />,
    },
    {
      id: 'redo',
      eyebrow: '3. 気に入らなければ',
      title: '1日だけ・1品だけ作り直し',
      lead: '全部を作り直さなくても、気になるところだけ変えられます。',
      points: [
        <>
          <b>1品だけ</b>：料理をタップ →「別のレシピにする（おまかせ）」か「レシピ一覧から選ぶ」。
        </>,
        <>
          <b>1日だけ</b>：曜日の「…」→「この日の献立を作り直す」。副菜の追加もここから。
        </>,
        <>
          <b>曜日の入れ替え</b>：カード左の点々のつまみを押したまま上下にドラッグ。
          または「…」→「ほかの曜日と入れ替える」。
        </>,
        '1週間まるごと作り直すボタンは、献立のいちばん下にあります。',
      ],
      where: '週間献立',
      art: <ArtRedo />,
    },
    {
      id: 'shopping',
      eyebrow: '4. 買い物リスト',
      title: '献立から自動で作られる',
      lead: '1週間分の材料を合計し、野菜・肉・魚…と売り場の順に並べます。家族のチェックもすぐに共有されます。',
      points: [
        <>
          <b>チェック</b>：丸をタップするか、行を<b>右へフリック</b>で「かごに入れた」。 戻すときは
          <b>左へフリック</b>。
        </>,
        <>
          <b>調味料は自動では入りません</b>
          。しょうゆ・みりん・油などや、米・水は家にある前提で除いています。
        </>,
        '切らしている調味料は、リストの下の「家にある前提で除いたもの」をタップすると入ります（次の週からも入ります）。',
        '「牛乳 1本」のように入力すれば、献立にないものも追加できます。',
      ],
      where: '下のタブ「買い物」',
      art: <ArtShopping />,
    },
    {
      id: 'recipe',
      eyebrow: '5. レシピを増やす',
      title: '写真から AI が自動で作成',
      lead: 'はじめから110品のレシピが入っています。家の定番や、気になるレシピも追加できます。',
      points: [
        <>
          <b>写真・URLから取り込む</b>：レシピ本の写真やレシピサイトの URL
          から、材料・手順・料理レベル・ 和洋中・主菜/汁物/副菜を AI
          が読み取って下書きにします。内容を確かめてから保存します。
        </>,
        <>
          AI の取り込みは<b>1人1日20回まで</b>（写真と URL の合計）です。
        </>,
        <>
          <b>手入力</b>
          ：「追加」から自分で入力できます。たれ（A）・あとから入れる調味料（B）のように、
          材料をグループに分けることもできます。
        </>,
        '作るときは「ゆっくりモード」で手順を1つずつ大きく表示。手順に時間があれば、タイマーも使えます。',
      ],
      where: '下のタブ「レシピ」→ 右上の「写真・URL」または「追加」',
      art: <ArtRecipe />,
    },
    {
      id: 'log',
      eyebrow: '6. 自炊記録',
      title: '作った料理を残す',
      lead: 'ホームやレシピの「作った」を押すと記録されます。',
      points: [
        '料理ごとに写真を残せます。',
        '月ごとに「作った料理」「自炊した日」「連続で自炊した日数」が見られます。',
        'ホームの「今日のごはん」からも、その場で記録できます。',
      ],
      where: 'ホーム →「自炊記録」',
      art: <ArtLog />,
    },
    {
      id: 'share',
      eyebrow: '7. 家族と共有',
      title: '招待リンクを送るだけ',
      lead: '同じグループのメンバーは、献立・買い物リスト・レシピ・自炊記録を一緒に使えます。',
      points: [
        <>
          「設定」→「グループ」で<b>招待リンク</b>を作り、LINE などで送ります。 6文字の
          <b>招待コード</b>を入力して参加することもできます。
        </>,
        'だれかが献立を変えたり、買い物リストにチェックをつけたりすると、ほかの人の画面にもすぐ反映されます。',
        <>
          グループ名は<b>「○○の食卓」</b>
          。実家用など、複数のグループを作って切り替えることもできます。
        </>,
      ],
      where: '下のタブ「設定」→「グループ」',
      art: <ArtShare />,
    },
    {
      id: 'install',
      eyebrow: '8. アプリのように使う',
      title: 'ホーム画面に追加',
      lead: 'ホーム画面にアイコンを置くと、アプリのようにすぐ開けます。',
      points: installPoints(),
      art: <ArtInstall />,
    },
  );

  return steps;
}
