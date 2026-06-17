import { run, queryOne } from "@/lib/db";
import { ensureEngSchema } from "@/lib/eng/db";

export async function seedVocabulary(): Promise<void> {
  await ensureEngSchema();
  const existing = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM eng_vocabulary`);
  if (existing && Number(existing.n) > 0) return;

  const words: Array<[string, string, string, string, string, string, string, number]> = [
    // chao_hoi
    ["hello", "/həˈloʊ/", "xin chào", "Hello, how are you?", "Xin chào, bạn có khỏe không?", "chao_hoi", "beginner", 1],
    ["hi", "/haɪ/", "chào", "Hi, my name is Nam.", "Chào, tên tôi là Nam.", "chao_hoi", "beginner", 2],
    ["goodbye", "/ˌɡʊdˈbaɪ/", "tạm biệt", "Goodbye, see you tomorrow!", "Tạm biệt, hẹn gặp lại ngày mai!", "chao_hoi", "beginner", 3],
    ["bye", "/baɪ/", "tạm biệt (thân mật)", "Bye! Have a great day.", "Tạm biệt! Chúc một ngày tốt lành.", "chao_hoi", "beginner", 4],
    ["please", "/pliːz/", "làm ơn / xin", "Please help me with this.", "Làm ơn giúp tôi việc này.", "chao_hoi", "beginner", 5],
    ["thank you", "/θæŋk juː/", "cảm ơn", "Thank you for your help.", "Cảm ơn vì sự giúp đỡ của bạn.", "chao_hoi", "beginner", 6],
    ["sorry", "/ˈsɒri/", "xin lỗi", "I am sorry for being late.", "Tôi xin lỗi vì đến muộn.", "chao_hoi", "beginner", 7],
    ["excuse me", "/ɪkˈskjuːz miː/", "xin lỗi (để hỏi/qua đường)", "Excuse me, where is the toilet?", "Xin lỗi, nhà vệ sinh ở đâu?", "chao_hoi", "beginner", 8],
    ["yes", "/jɛs/", "vâng / có", "Yes, I understand.", "Vâng, tôi hiểu.", "chao_hoi", "beginner", 9],
    ["no", "/noʊ/", "không", "No, I don't want it.", "Không, tôi không muốn.", "chao_hoi", "beginner", 10],
    ["maybe", "/ˈmeɪbi/", "có thể", "Maybe we can go tomorrow.", "Có thể chúng ta đi vào ngày mai.", "chao_hoi", "beginner", 11],
    ["ok", "/oʊˈkeɪ/", "được rồi / ổn", "Ok, let's do it.", "Được rồi, hãy làm đi.", "chao_hoi", "beginner", 12],

    // gia_dinh
    ["family", "/ˈfæməli/", "gia đình", "I love my family very much.", "Tôi rất yêu gia đình của mình.", "gia_dinh", "beginner", 13],
    ["father", "/ˈfɑːðər/", "cha / bố", "My father is a doctor.", "Bố tôi là bác sĩ.", "gia_dinh", "beginner", 14],
    ["mother", "/ˈmʌðər/", "mẹ", "My mother cooks delicious food.", "Mẹ tôi nấu ăn rất ngon.", "gia_dinh", "beginner", 15],
    ["brother", "/ˈbrʌðər/", "anh / em trai", "My brother is ten years old.", "Em trai tôi mười tuổi.", "gia_dinh", "beginner", 16],
    ["sister", "/ˈsɪstər/", "chị / em gái", "My sister likes drawing.", "Chị gái tôi thích vẽ tranh.", "gia_dinh", "beginner", 17],
    ["son", "/sʌn/", "con trai", "Their son is very smart.", "Con trai họ rất thông minh.", "gia_dinh", "beginner", 18],
    ["daughter", "/ˈdɔːtər/", "con gái", "She has one daughter.", "Cô ấy có một con gái.", "gia_dinh", "beginner", 19],
    ["husband", "/ˈhʌzbənd/", "chồng", "Her husband works abroad.", "Chồng cô ấy làm việc ở nước ngoài.", "gia_dinh", "beginner", 20],
    ["wife", "/waɪf/", "vợ", "His wife is a teacher.", "Vợ anh ấy là giáo viên.", "gia_dinh", "beginner", 21],
    ["child", "/tʃaɪld/", "đứa trẻ / con", "The child is playing outside.", "Đứa trẻ đang chơi bên ngoài.", "gia_dinh", "beginner", 22],
    ["baby", "/ˈbeɪbi/", "em bé", "The baby is sleeping.", "Em bé đang ngủ.", "gia_dinh", "beginner", 23],
    ["grandparent", "/ˈɡrændpeərənt/", "ông bà", "My grandparents live in the countryside.", "Ông bà tôi sống ở vùng nông thôn.", "gia_dinh", "beginner", 24],

    // thuc_an
    ["rice", "/raɪs/", "cơm / gạo", "I eat rice every day.", "Tôi ăn cơm mỗi ngày.", "thuc_an", "beginner", 25],
    ["noodle", "/ˈnuːdl/", "mì / bún", "She likes eating noodles.", "Cô ấy thích ăn mì.", "thuc_an", "beginner", 26],
    ["bread", "/brɛd/", "bánh mì", "He eats bread for breakfast.", "Anh ấy ăn bánh mì vào bữa sáng.", "thuc_an", "beginner", 27],
    ["water", "/ˈwɔːtər/", "nước", "Please give me a glass of water.", "Làm ơn cho tôi một ly nước.", "thuc_an", "beginner", 28],
    ["coffee", "/ˈkɒfi/", "cà phê", "I drink coffee every morning.", "Tôi uống cà phê mỗi sáng.", "thuc_an", "beginner", 29],
    ["tea", "/tiː/", "trà", "Would you like some tea?", "Bạn có muốn uống trà không?", "thuc_an", "beginner", 30],
    ["fruit", "/fruːt/", "trái cây", "Eating fruit is good for health.", "Ăn trái cây tốt cho sức khỏe.", "thuc_an", "beginner", 31],
    ["vegetable", "/ˈvɛdʒtəbl/", "rau củ", "She eats a lot of vegetables.", "Cô ấy ăn nhiều rau củ.", "thuc_an", "beginner", 32],
    ["meat", "/miːt/", "thịt", "I don't eat meat.", "Tôi không ăn thịt.", "thuc_an", "beginner", 33],
    ["fish", "/fɪʃ/", "cá", "We had fish for dinner.", "Chúng tôi ăn cá vào bữa tối.", "thuc_an", "beginner", 34],
    ["soup", "/suːp/", "súp / canh", "The soup is hot and delicious.", "Canh này nóng và ngon.", "thuc_an", "beginner", 35],
    ["egg", "/ɛɡ/", "trứng", "I boil two eggs every morning.", "Tôi luộc hai quả trứng mỗi sáng.", "thuc_an", "beginner", 36],

    // dong_tu
    ["go", "/ɡoʊ/", "đi", "I go to school every day.", "Tôi đi học mỗi ngày.", "dong_tu", "beginner", 37],
    ["come", "/kʌm/", "đến / đi tới", "Please come here.", "Xin hãy đến đây.", "dong_tu", "beginner", 38],
    ["eat", "/iːt/", "ăn", "We eat lunch at noon.", "Chúng tôi ăn trưa vào buổi trưa.", "dong_tu", "beginner", 39],
    ["drink", "/drɪŋk/", "uống", "He drinks water after exercise.", "Anh ấy uống nước sau khi tập thể dục.", "dong_tu", "beginner", 40],
    ["sleep", "/sliːp/", "ngủ", "Children should sleep early.", "Trẻ em nên đi ngủ sớm.", "dong_tu", "beginner", 41],
    ["work", "/wɜːrk/", "làm việc", "She works at a hospital.", "Cô ấy làm việc ở bệnh viện.", "dong_tu", "beginner", 42],
    ["play", "/pleɪ/", "chơi", "The kids play in the park.", "Các bé chơi trong công viên.", "dong_tu", "beginner", 43],
    ["study", "/ˈstʌdi/", "học", "I study English every evening.", "Tôi học tiếng Anh mỗi tối.", "dong_tu", "beginner", 44],
    ["love", "/lʌv/", "yêu", "I love my family.", "Tôi yêu gia đình mình.", "dong_tu", "beginner", 45],
    ["like", "/laɪk/", "thích", "She likes reading books.", "Cô ấy thích đọc sách.", "dong_tu", "beginner", 46],
    ["want", "/wɒnt/", "muốn", "I want a cup of coffee.", "Tôi muốn một tách cà phê.", "dong_tu", "beginner", 47],
    ["need", "/niːd/", "cần", "We need more time.", "Chúng ta cần thêm thời gian.", "dong_tu", "beginner", 48],
    ["make", "/meɪk/", "làm / tạo ra", "She makes beautiful clothes.", "Cô ấy làm những bộ quần áo đẹp.", "dong_tu", "beginner", 49],
    ["give", "/ɡɪv/", "cho / tặng", "He gave me a gift.", "Anh ấy tặng tôi một món quà.", "dong_tu", "beginner", 50],
    ["see", "/siː/", "nhìn thấy", "I can see the mountains.", "Tôi có thể nhìn thấy những ngọn núi.", "dong_tu", "beginner", 51],
    ["know", "/noʊ/", "biết", "Do you know her name?", "Bạn có biết tên cô ấy không?", "dong_tu", "beginner", 52],

    // tinh_tu
    ["big", "/bɪɡ/", "to / lớn", "This is a big house.", "Đây là một ngôi nhà to.", "tinh_tu", "beginner", 53],
    ["small", "/smɔːl/", "nhỏ", "I have a small dog.", "Tôi có một con chó nhỏ.", "tinh_tu", "beginner", 54],
    ["good", "/ɡʊd/", "tốt / hay", "This is a good idea.", "Đây là một ý tưởng hay.", "tinh_tu", "beginner", 55],
    ["bad", "/bæd/", "xấu / tệ", "The weather is bad today.", "Thời tiết hôm nay tệ.", "tinh_tu", "beginner", 56],
    ["beautiful", "/ˈbjuːtɪfl/", "đẹp", "She is a beautiful woman.", "Cô ấy là một người phụ nữ đẹp.", "tinh_tu", "beginner", 57],
    ["ugly", "/ˈʌɡli/", "xấu xí", "That mask is ugly.", "Cái mặt nạ đó xấu xí.", "tinh_tu", "beginner", 58],
    ["old", "/oʊld/", "cũ / già", "This is an old building.", "Đây là một tòa nhà cũ.", "tinh_tu", "beginner", 59],
    ["new", "/njuː/", "mới", "I bought a new phone.", "Tôi mua một chiếc điện thoại mới.", "tinh_tu", "beginner", 60],
    ["fast", "/fæst/", "nhanh", "He is a fast runner.", "Anh ấy là người chạy nhanh.", "tinh_tu", "beginner", 61],
    ["slow", "/sloʊ/", "chậm", "The turtle moves slow.", "Con rùa di chuyển chậm.", "tinh_tu", "beginner", 62],
    ["happy", "/ˈhæpi/", "vui / hạnh phúc", "I feel happy today.", "Tôi cảm thấy vui hôm nay.", "tinh_tu", "beginner", 63],
    ["sad", "/sæd/", "buồn", "She looks sad.", "Cô ấy trông có vẻ buồn.", "tinh_tu", "beginner", 64],
    ["hot", "/hɒt/", "nóng", "It is hot outside.", "Trời bên ngoài rất nóng.", "tinh_tu", "beginner", 65],
    ["cold", "/koʊld/", "lạnh", "The water is cold.", "Nước lạnh.", "tinh_tu", "beginner", 66],
    ["easy", "/ˈiːzi/", "dễ", "This exercise is easy.", "Bài tập này dễ.", "tinh_tu", "beginner", 67],
    ["hard", "/hɑːrd/", "khó / cứng", "The exam was very hard.", "Kỳ thi rất khó.", "tinh_tu", "beginner", 68],
  ];

  for (const [word, phonetic, meaning_vi, example_en, example_vi, topic, level, sort_order] of words) {
    await run(
      `INSERT INTO eng_vocabulary (word, phonetic, meaning_vi, example_en, example_vi, topic, level, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      word, phonetic, meaning_vi, example_en, example_vi, topic, level, sort_order
    );
  }
}

export async function seedGrammar(): Promise<void> {
  await ensureEngSchema();
  const existing = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM eng_grammar_lessons`);
  if (existing && Number(existing.n) > 0) return;

  type LessonData = {
    title: string;
    description_vi: string;
    content_vi: string;
    level: string;
    sort_order: number;
    exercises: Array<{
      question: string;
      options: string[];
      answer: string;
      explanation_vi: string;
      sort_order: number;
    }>;
  };

  const lessons: LessonData[] = [
    {
      title: "Động từ 'be' (am/is/are)",
      description_vi: "Học cách dùng động từ 'be' với các chủ ngữ khác nhau",
      content_vi: `<h2>Động từ "be" (am / is / are)</h2>
<p>Động từ "be" là một trong những động từ quan trọng nhất trong tiếng Anh. Nó có ba dạng ở thì hiện tại:</p>
<table>
  <tr><th>Chủ ngữ</th><th>Động từ be</th><th>Ví dụ</th></tr>
  <tr><td>I</td><td>am</td><td>I am a student.</td></tr>
  <tr><td>He / She / It</td><td>is</td><td>She is happy.</td></tr>
  <tr><td>You / We / They</td><td>are</td><td>They are my friends.</td></tr>
</table>
<h3>Dạng phủ định</h3>
<ul>
  <li>I am not → I'm not</li>
  <li>He/She/It is not → He's not / He isn't</li>
  <li>You/We/They are not → You're not / You aren't</li>
</ul>
<h3>Dạng câu hỏi</h3>
<ul>
  <li>Am I late?</li>
  <li>Is she a teacher?</li>
  <li>Are they students?</li>
</ul>`,
      level: "beginner",
      sort_order: 1,
      exercises: [
        { question: "I ___ a student.", options: ["am", "is", "are", "be"], answer: "am", explanation_vi: "Với chủ ngữ 'I', ta dùng 'am'.", sort_order: 1 },
        { question: "She ___ my friend.", options: ["am", "is", "are", "be"], answer: "is", explanation_vi: "Với chủ ngữ số ít ngôi thứ 3 (She), ta dùng 'is'.", sort_order: 2 },
        { question: "They ___ happy.", options: ["am", "is", "are", "be"], answer: "are", explanation_vi: "Với chủ ngữ số nhiều (They), ta dùng 'are'.", sort_order: 3 },
        { question: "It ___ a big house.", options: ["am", "is", "are", "be"], answer: "is", explanation_vi: "Với 'It', ta dùng 'is'.", sort_order: 4 },
        { question: "You ___ very kind.", options: ["am", "is", "are", "be"], answer: "are", explanation_vi: "Với 'You' (cả số ít lẫn số nhiều), ta dùng 'are'.", sort_order: 5 },
        { question: "We ___ from Vietnam.", options: ["am", "is", "are", "be"], answer: "are", explanation_vi: "Với 'We', ta dùng 'are'.", sort_order: 6 },
        { question: "He ___ a doctor.", options: ["am", "is", "are", "be"], answer: "is", explanation_vi: "Với 'He', ta dùng 'is'.", sort_order: 7 },
        { question: "The children ___ at school.", options: ["am", "is", "are", "be"], answer: "are", explanation_vi: "Với chủ ngữ số nhiều (children), ta dùng 'are'.", sort_order: 8 },
      ],
    },
    {
      title: "Hiện tại đơn (Present Simple)",
      description_vi: "Học cách dùng thì hiện tại đơn để diễn tả thói quen và sự thật",
      content_vi: `<h2>Thì Hiện Tại Đơn (Present Simple)</h2>
<h3>Cấu trúc</h3>
<ul>
  <li><strong>Khẳng định:</strong> S + V (nguyên thể) / V+s/es (với He/She/It)</li>
  <li><strong>Phủ định:</strong> S + do/does + not + V</li>
  <li><strong>Câu hỏi:</strong> Do/Does + S + V?</li>
</ul>
<h3>Cách thêm -s/-es</h3>
<ul>
  <li>Động từ thường: thêm -s (work → works, play → plays)</li>
  <li>Tận cùng -s, -ss, -sh, -ch, -x, -o: thêm -es (go → goes, watch → watches)</li>
  <li>Tận cùng -y sau phụ âm: đổi y → ies (study → studies)</li>
</ul>
<h3>Cách dùng</h3>
<ul>
  <li>Diễn tả thói quen: <em>I eat rice every day.</em></li>
  <li>Diễn tả sự thật: <em>The sun rises in the east.</em></li>
  <li>Kèm trạng từ: always, usually, often, sometimes, never</li>
</ul>`,
      level: "beginner",
      sort_order: 2,
      exercises: [
        { question: "She ___ (study) English every day.", options: ["study", "studies", "studys", "is study"], answer: "studies", explanation_vi: "Với He/She/It, động từ kết thúc bằng -y (sau phụ âm) đổi thành -ies: study → studies.", sort_order: 1 },
        { question: "They ___ (watch) TV at night.", options: ["watch", "watches", "watchs", "watching"], answer: "watch", explanation_vi: "Với They (số nhiều), động từ giữ nguyên dạng nguyên thể.", sort_order: 2 },
        { question: "He ___ (go) to work by bus.", options: ["go", "goes", "gos", "going"], answer: "goes", explanation_vi: "Với He, động từ kết thúc bằng -o thêm -es: go → goes.", sort_order: 3 },
        { question: "I ___ (not like) spicy food.", options: ["not like", "don't like", "doesn't like", "not likes"], answer: "don't like", explanation_vi: "Phủ định với I dùng 'don't + V nguyên thể'.", sort_order: 4 },
        { question: "She ___ (not eat) meat.", options: ["not eat", "don't eat", "doesn't eat", "not eats"], answer: "doesn't eat", explanation_vi: "Phủ định với She dùng 'doesn't + V nguyên thể'.", sort_order: 5 },
        { question: "___ you speak English?", options: ["Do", "Does", "Are", "Is"], answer: "Do", explanation_vi: "Câu hỏi với You dùng 'Do + You + V?'", sort_order: 6 },
        { question: "___ he work here?", options: ["Do", "Does", "Is", "Are"], answer: "Does", explanation_vi: "Câu hỏi với He dùng 'Does + He + V?'", sort_order: 7 },
      ],
    },
    {
      title: "Hiện tại tiếp diễn (Present Continuous)",
      description_vi: "Học cách dùng thì hiện tại tiếp diễn để diễn tả hành động đang xảy ra",
      content_vi: `<h2>Thì Hiện Tại Tiếp Diễn (Present Continuous)</h2>
<h3>Cấu trúc</h3>
<ul>
  <li><strong>Khẳng định:</strong> S + am/is/are + V-ing</li>
  <li><strong>Phủ định:</strong> S + am/is/are + not + V-ing</li>
  <li><strong>Câu hỏi:</strong> Am/Is/Are + S + V-ing?</li>
</ul>
<h3>Cách thêm -ing</h3>
<ul>
  <li>Động từ thường: thêm -ing (work → working, play → playing)</li>
  <li>Tận cùng -e: bỏ -e rồi thêm -ing (make → making, write → writing)</li>
  <li>Kết thúc CVC (1 âm tiết): gấp đôi phụ âm cuối (run → running, swim → swimming)</li>
</ul>
<h3>Cách dùng</h3>
<ul>
  <li>Hành động đang xảy ra lúc nói: <em>I am studying now.</em></li>
  <li>Hành động tạm thời: <em>She is living in Hanoi this month.</em></li>
  <li>Kèm trạng từ: now, at the moment, right now, currently</li>
</ul>`,
      level: "beginner",
      sort_order: 3,
      exercises: [
        { question: "I ___ (read) a book now.", options: ["am reading", "is reading", "are reading", "reading"], answer: "am reading", explanation_vi: "Với I, ta dùng 'am + V-ing'.", sort_order: 1 },
        { question: "She ___ (cook) dinner at the moment.", options: ["am cooking", "is cooking", "are cooking", "cooks"], answer: "is cooking", explanation_vi: "Với She, ta dùng 'is + V-ing'.", sort_order: 2 },
        { question: "They ___ (play) football right now.", options: ["am playing", "is playing", "are playing", "plays"], answer: "are playing", explanation_vi: "Với They, ta dùng 'are + V-ing'.", sort_order: 3 },
        { question: "He ___ (not sleep). He is working.", options: ["is not sleeping", "are not sleeping", "am not sleeping", "not sleeping"], answer: "is not sleeping", explanation_vi: "Phủ định với He dùng 'is not + V-ing'.", sort_order: 4 },
        { question: "___ you listening to music?", options: ["Am", "Is", "Are", "Do"], answer: "Are", explanation_vi: "Câu hỏi với You dùng 'Are + You + V-ing?'", sort_order: 5 },
        { question: "What ___ she doing?", options: ["am", "is", "are", "do"], answer: "is", explanation_vi: "Câu hỏi với She dùng 'is'.", sort_order: 6 },
        { question: "The baby ___ (sleep) right now.", options: ["am sleeping", "is sleeping", "are sleeping", "sleeps"], answer: "is sleeping", explanation_vi: "Với The baby (số ít), ta dùng 'is + V-ing'.", sort_order: 7 },
      ],
    },
    {
      title: "Quá khứ đơn (Past Simple)",
      description_vi: "Học cách dùng thì quá khứ đơn để diễn tả hành động đã xảy ra",
      content_vi: `<h2>Thì Quá Khứ Đơn (Past Simple)</h2>
<h3>Cấu trúc</h3>
<ul>
  <li><strong>Khẳng định:</strong> S + V-ed (động từ có quy tắc) / V2 (bất quy tắc)</li>
  <li><strong>Phủ định:</strong> S + did not (didn't) + V nguyên thể</li>
  <li><strong>Câu hỏi:</strong> Did + S + V nguyên thể?</li>
</ul>
<h3>Động từ có quy tắc (thêm -ed)</h3>
<ul>
  <li>work → worked, play → played, watch → watched</li>
  <li>Tận cùng -e: thêm -d (live → lived, love → loved)</li>
  <li>Tận cùng CVC: gấp đôi phụ âm (stop → stopped, plan → planned)</li>
  <li>Tận cùng -y (sau phụ âm): đổi y → ied (study → studied)</li>
</ul>
<h3>Động từ bất quy tắc phổ biến</h3>
<ul>
  <li>go → went, come → came, eat → ate, drink → drank</li>
  <li>see → saw, make → made, give → gave, know → knew</li>
</ul>
<h3>Cách dùng</h3>
<ul>
  <li>Hành động đã hoàn thành: <em>I watched TV yesterday.</em></li>
  <li>Kèm trạng từ: yesterday, last week, ago, in 2020</li>
</ul>`,
      level: "intermediate",
      sort_order: 4,
      exercises: [
        { question: "She ___ (go) to the market yesterday.", options: ["go", "goes", "went", "goed"], answer: "went", explanation_vi: "Go là động từ bất quy tắc, quá khứ đơn là 'went'.", sort_order: 1 },
        { question: "I ___ (study) English last night.", options: ["study", "studied", "studyed", "studies"], answer: "studied", explanation_vi: "Study kết thúc bằng -y (sau phụ âm), đổi thành -ied: studied.", sort_order: 2 },
        { question: "He ___ (not eat) breakfast this morning.", options: ["not ate", "didn't eat", "doesn't eat", "didn't ate"], answer: "didn't eat", explanation_vi: "Phủ định quá khứ dùng 'didn't + V nguyên thể'.", sort_order: 3 },
        { question: "___ you see the movie last week?", options: ["Do", "Did", "Does", "Were"], answer: "Did", explanation_vi: "Câu hỏi quá khứ đơn dùng 'Did + S + V nguyên thể?'", sort_order: 4 },
        { question: "They ___ (watch) the game last night.", options: ["watch", "watched", "watches", "watching"], answer: "watched", explanation_vi: "Watch là động từ có quy tắc, thêm -ed: watched.", sort_order: 5 },
        { question: "She ___ (make) a cake for my birthday.", options: ["make", "makes", "maked", "made"], answer: "made", explanation_vi: "Make là động từ bất quy tắc, quá khứ đơn là 'made'.", sort_order: 6 },
        { question: "We ___ (not go) to school yesterday.", options: ["not went", "didn't go", "don't go", "didn't went"], answer: "didn't go", explanation_vi: "Phủ định quá khứ dùng 'didn't + V nguyên thể' (không dùng V2).", sort_order: 7 },
      ],
    },
    {
      title: "Câu hỏi Yes/No (Yes/No Questions)",
      description_vi: "Học cách đặt câu hỏi Yes/No trong tiếng Anh",
      content_vi: `<h2>Câu Hỏi Yes/No</h2>
<p>Câu hỏi Yes/No là câu hỏi chỉ cần trả lời "Yes" hoặc "No".</p>
<h3>Cấu trúc theo thì</h3>
<table>
  <tr><th>Thì</th><th>Cấu trúc</th><th>Ví dụ</th></tr>
  <tr><td>Hiện tại đơn (I/You/We/They)</td><td>Do + S + V?</td><td>Do you like coffee?</td></tr>
  <tr><td>Hiện tại đơn (He/She/It)</td><td>Does + S + V?</td><td>Does she speak English?</td></tr>
  <tr><td>Quá khứ đơn</td><td>Did + S + V?</td><td>Did they go to school?</td></tr>
  <tr><td>Hiện tại tiếp diễn</td><td>Am/Is/Are + S + V-ing?</td><td>Is he working now?</td></tr>
</table>
<h3>Cách trả lời</h3>
<ul>
  <li>Trả lời ngắn: Yes, I do. / No, I don't. / Yes, she does. / No, he didn't.</li>
  <li>Không trả lời: Yes, I do like. (Sai!) → Yes, I do. (Đúng!)</li>
</ul>`,
      level: "beginner",
      sort_order: 5,
      exercises: [
        { question: "___ you live in Hanoi?", options: ["Do", "Does", "Did", "Are"], answer: "Do", explanation_vi: "Câu hỏi hiện tại đơn với 'You' dùng 'Do'.", sort_order: 1 },
        { question: "___ she work here?", options: ["Do", "Does", "Did", "Is"], answer: "Does", explanation_vi: "Câu hỏi hiện tại đơn với 'She' dùng 'Does'.", sort_order: 2 },
        { question: "___ they go to the party last night?", options: ["Do", "Does", "Did", "Were"], answer: "Did", explanation_vi: "Câu hỏi quá khứ đơn dùng 'Did' cho mọi chủ ngữ.", sort_order: 3 },
        { question: "___ he studying right now?", options: ["Do", "Does", "Did", "Is"], answer: "Is", explanation_vi: "Câu hỏi hiện tại tiếp diễn với 'He' dùng 'Is'.", sort_order: 4 },
        { question: "Do you like pizza? — Yes, ___ .", options: ["I do", "I does", "I am", "I did"], answer: "I do", explanation_vi: "Trả lời ngắn cho câu hỏi với 'Do' là 'Yes, I do.'", sort_order: 5 },
        { question: "Does she speak French? — No, ___ .", options: ["she don't", "she doesn't", "she didn't", "she not"], answer: "she doesn't", explanation_vi: "Trả lời ngắn phủ định cho câu hỏi với 'Does' là 'No, she doesn't.'", sort_order: 6 },
        { question: "Did they win the game? — No, ___ .", options: ["they don't", "they doesn't", "they didn't", "they not"], answer: "they didn't", explanation_vi: "Trả lời ngắn phủ định cho câu hỏi quá khứ là 'No, they didn't.'", sort_order: 7 },
      ],
    },
  ];

  for (const lesson of lessons) {
    const { exercises, ...lessonData } = lesson;
    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO eng_grammar_lessons (title, description_vi, content_vi, level, sort_order)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
      lessonData.title,
      lessonData.description_vi,
      lessonData.content_vi,
      lessonData.level,
      lessonData.sort_order
    );
    if (!inserted) continue;
    for (const ex of exercises) {
      await run(
        `INSERT INTO eng_grammar_exercises (lesson_id, type, question, options, answer, explanation_vi, sort_order)
         VALUES (?, 'multiple_choice', ?, ?, ?, ?, ?)`,
        inserted.id,
        ex.question,
        JSON.stringify(ex.options),
        ex.answer,
        ex.explanation_vi,
        ex.sort_order
      );
    }
  }
}
