// Conteúdo estruturado da SouClinic — fonte: SDR SouClinic.docx (ver SPEC-IA-SDR.md §5).
//
// Dois blocos, de propósito:
//
// - CLINIC_KNOWLEDGE: fatos que respondem pergunta de paciente. Vai pro RAG
//   (clinic_documents) e também pro system prompt.
// - DIRETRIZES_SDR: como atender, persona e tratamento de objeção. Vai SÓ pro
//   system prompt.
//
// A separação existe porque misturar os dois degradava a busca: numa pergunta
// como "vocês aceitam meu plano odontológico?" o RAG devolvia "Público-alvo" e
// "Serviços oferecidos" em vez do chunk sobre convênio. Instrução de comportamento
// tem que estar sempre no prompt, não sorteada por similaridade.

export interface KnowledgeChunk {
  title: string;
  content: string;
  /**
   * Como o paciente pergunta isso, na língua dele. Entra só no texto que vai pro
   * embedding — o `content` devolvido ao agente continua limpo. É o que aproxima
   * o vetor do chunk da pergunta real ("plano odontológico" vs "convênio",
   * "aparelho" vs "ortodontia").
   */
  perguntas?: string[];
}

/** Texto embarcado no pgvector: título + perguntas equivalentes + conteúdo. */
export function textoParaEmbedding(c: KnowledgeChunk): string {
  const perguntas = c.perguntas?.length ? `\nPerguntas equivalentes: ${c.perguntas.join(" ")}` : "";
  return `${c.title}${perguntas}\n${c.content}`;
}

export const CLINIC_KNOWLEDGE: KnowledgeChunk[] = [
  {
    title: "Convênio e plano de saúde — não aceita",
    perguntas: [
      "Vocês aceitam meu plano odontológico?",
      "Atendem por convênio?",
      "Trabalham com plano de saúde?",
      "Aceitam Amil, Unimed, Bradesco Dental, Odontoprev, SulAmérica?",
      "É só particular?",
      "Meu plano cobre?",
    ],
    content:
      "A SouClinic não trabalha com convênio nem plano de saúde — nenhum. O atendimento é exclusivamente particular, escolha feita para garantir a qualidade dos materiais e dos profissionais. Formas de pagamento facilitadas: cartão de crédito, cartão de débito, dinheiro, boleto e PIX.",
  },
  {
    title: "Preço e valor do tratamento",
    // De propósito sem citar procedimento específico ("preço de implante",
    // "quanto custa aparelho"): isso fazia este chunk vencer o de especialidades
    // em perguntas de disponibilidade como "vocês colocam aparelho?".
    perguntas: [
      "Quanto custa?",
      "Qual o valor?",
      "Qual o preço do tratamento?",
      "Vocês têm tabela de preços?",
      "Me passa um orçamento?",
      "Quanto vou gastar?",
      "Tá caro?",
    ],
    content:
      "O valor só é passado depois da avaliação presencial, nunca por telefone ou WhatsApp. O motivo é que cada boca é diferente: sem examinar, qualquer número seria chute e poderia frustrar o paciente depois. Na avaliação o dentista examina, monta o plano de tratamento e apresenta o valor exato, com as opções de pagamento.",
  },
  {
    title: "Avaliação inicial — gratuita e sem compromisso",
    perguntas: [
      "A primeira consulta é paga?",
      "Quanto custa a avaliação?",
      "A consulta de avaliação tem custo?",
      "Preciso pagar pra ser atendido na primeira vez?",
      "Não tenho dinheiro pra primeira consulta",
    ],
    content:
      "A primeira consulta é uma avaliação personalizada, sem compromisso e sem custo. O paciente só começa a pagar quando decide iniciar o tratamento. É uma avaliação geral, com o próximo dentista disponível — não precisa escolher especialista.",
  },
  {
    title: "Formas de pagamento e parcelamento",
    perguntas: [
      "Posso parcelar?",
      "Aceitam cartão?",
      "Dá pra pagar no boleto?",
      "Aceitam PIX?",
      "Em quantas vezes posso dividir?",
      "Precisa de análise de crédito?",
      "Não tenho dinheiro agora",
    ],
    content:
      "Formas de pagamento: cartão de crédito, cartão de débito, dinheiro, boleto e PIX. Crédito e boleto não exigem aprovação de crédito prévia, o que facilita começar o tratamento mesmo sem ter o valor à vista. O parcelamento é alinhado ao plano de tratamento, na avaliação.",
  },
  {
    title: "Como funciona o pagamento no boleto",
    perguntas: [
      "Fechando no boleto dá pra fazer tudo de uma vez?",
      "Como funciona o boleto?",
      "Posso fazer o tratamento todo e pagar depois?",
    ],
    content:
      "O boleto facilita o acesso ao tratamento, mas não libera todos os procedimentos de uma vez. O paciente precisa se manter adimplente, e o planejamento alinha os boletos com os procedimentos contratados — cada etapa do tratamento acompanha o pagamento correspondente.",
  },
  {
    title: "Horário de atendimento",
    perguntas: [
      "Que horas vocês abrem?",
      "Abre sábado?",
      "Atende domingo?",
      "Até que horas fica aberto?",
      "Qual o horário de funcionamento?",
      "Atende no fim de semana?",
    ],
    content:
      "Segunda a sexta das 9h às 19h. Sábado das 9h às 17h. Domingo a clínica não abre.",
  },
  {
    title: "Endereço, como chegar e estacionamento",
    perguntas: [
      "Onde fica a clínica?",
      "Qual o endereço?",
      "Tem estacionamento?",
      "É perto do metrô?",
      "Como faço pra chegar aí?",
      "Fica em Águas Claras?",
      "Vocês têm outra unidade?",
    ],
    content:
      "Avenida Pau Brasil, Lote 06, Loja 02, Edifício E-Business, Águas Claras — DF, CEP 71916-500. Fica ao lado da Estação de Metrô Águas Claras, então dá pra vir de metrô sem se preocupar com estacionamento. Unidade única.",
  },
  {
    title: "Especialidades e tratamentos atendidos",
    // Formulações de disponibilidade ("vocês fazem/atendem/colocam"), não de preço.
    perguntas: [
      "Vocês fazem implante?",
      "Vocês colocam aparelho?",
      "Vocês atendem ortodontia?",
      "Trabalham com lente de porcelana ou faceta?",
      "Vocês fazem tratamento de canal?",
      "Tratam gengiva?",
      "Fazem prótese ou dentadura?",
      "Fazem restauração?",
      "Preciso de implante, vocês atendem isso?",
      "Que tipo de tratamento vocês fazem?",
      "Quais especialidades vocês têm?",
    ],
    content:
      "A SouClinic atende: clínico geral, ortodontia (aparelho), periodontia (tratamento de gengiva), implantodontia (implantes), dentística (restaurações), estética com facetas e lentes em resina e/ou porcelana, endodontia (tratamento de canal) e prótese.",
  },
  {
    title: "Diferenciais da clínica",
    perguntas: [
      "Por que escolher a SouClinic?",
      "O que vocês têm de diferente?",
      "A clínica é boa?",
    ],
    content:
      "Tratamento odontológico completo com atenção genuína, transparência e competência — o bem-estar do paciente é sempre a prioridade. O paciente é ouvido sem pressa, entende o que será feito e por quê, e sabe o custo antes de começar, sem surpresas.",
  },
];

/**
 * Persona, política de atendimento e tratamento de objeção. Só system prompt —
 * fora do RAG de propósito (ver comentário no topo do arquivo).
 */
export const DIRETRIZES_SDR: KnowledgeChunk[] = [
  {
    title: "Apresentação da clínica",
    content:
      "A SouClinic é construída por pessoas que se respeitam, colaboram e sabem que o resultado coletivo depende de cada um fazer bem a sua parte. Ambiente harmonioso: não porque não existem desafios, mas porque existe respeito mútuo para superá-los.",
  },
  {
    title: "Quem é o paciente da SouClinic",
    content:
      "Pessoas interessadas em renovar o sorriso e a autoestima. O pagamento facilitado via boleto também atrai pacientes que preferem tratamento programado, com boletos alinhados ao plano de tratamento.",
  },
  {
    title: "As três palavras",
    content:
      "Todo paciente que sai da SouClinic deve conseguir descrever a experiência com três palavras: Atenciosos (sentiu que foi ouvido, sem pressa, a dúvida dele importou), Transparentes (entendeu o que foi feito, por quê, e quanto custa — sem surpresas), Competentes (saiu confiante de ter recebido o melhor tratamento possível).",
  },
  {
    title: "Valores do atendimento",
    content:
      "Ética acima de tudo (nunca indicar procedimento que não seja de real interesse do paciente); Transparência (clareza sobre diagnósticos, custos e expectativas); Competência com humildade; Acolhimento; Responsabilidade (quando erra, assume e corrige); Comprometimento com o paciente e o tratamento.",
  },
  {
    title: "Objeção — \"não tenho dinheiro agora\"",
    content:
      "Acolher sem pressionar e lembrar que existem cartão de crédito e boleto, formas que não exigem aprovação de crédito prévia. Reforçar que a avaliação em si não custa nada, então não há risco em vir conhecer.",
  },
  {
    title: "Objeção — \"não tenho dinheiro pra primeira consulta\"",
    content:
      "Esclarecer que a primeira consulta é personalizada, sem compromisso e sem custo — o paciente só começa a pagar quando o tratamento é iniciado.",
  },
  {
    title: "Objeção — \"vou ver um dia que consigo e te aviso\"",
    content:
      "Não deixar em aberto. Oferecer horário concreto (ex.: hoje às 16h, amanhã às 9h) e reservar na hora, com tom acolhedor de prioridade, sem pressão e sem constranger.",
  },
  {
    title: "Atendimento ruim — o que evitar",
    content:
      "Não ouvir o que o paciente realmente precisa (escuta ativa fraca reduz confirmação e comparecimento na avaliação); abandonar um paciente em tratamento; indicar procedimento por interesse financeiro da clínica em vez do interesse do paciente.",
  },
];
