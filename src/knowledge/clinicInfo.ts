// Conteúdo estruturado da SouClinic — fonte: SDR SouClinic.docx (ver SPEC-IA-SDR.md §3).
// Cada entrada vira um chunk na base de conhecimento (clinic_documents) e também
// alimenta o system prompt do agente diretamente (ver src/agent/systemPrompt.ts).

export interface KnowledgeChunk {
  title: string;
  content: string;
}

export const CLINIC_KNOWLEDGE: KnowledgeChunk[] = [
  {
    title: "Apresentação",
    content:
      "A SouClinic é construída por pessoas que se respeitam, colaboram e sabem que o resultado coletivo depende de cada um fazer bem a sua parte. Ambiente harmonioso: não porque não existem desafios, mas porque existe respeito mútuo para superá-los.",
  },
  {
    title: "Serviços oferecidos",
    content:
      "Clínico geral, Ortodontia, Periodontia, Implantodontia, Dentística, Estética (facetas e lentes em resina e/ou porcelana), Endodontia, Prótese.",
  },
  {
    title: "Valores e formas de pagamento",
    content:
      "Os valores são passados somente após avaliação presencial, para indicar o tratamento certo. Formas de pagamento: cartão de crédito, cartão de débito, dinheiro, boleto e PIX. Não trabalha com convênio/plano de saúde — só atendimento particular.",
  },
  {
    title: "Horário de atendimento",
    content: "Segunda a sexta das 9h às 19h. Sábado das 9h às 17h. Domingo fechado.",
  },
  {
    title: "Endereço",
    content:
      "Avenida Pau Brasil, Lote 06, Loja 02, Edifício E-Business, Águas Claras — DF, CEP 71916-500. Ao lado da Estação de Metrô Águas Claras. Unidade única.",
  },
  {
    title: "Público-alvo",
    content:
      "Pessoas interessadas em renovar o sorriso e a autoestima. O pagamento facilitado via boleto também atrai pacientes que preferem tratamento programado, com boletos alinhados ao plano de tratamento.",
  },
  {
    title: "Diferenciais",
    content:
      "Tratamento odontológico completo com atenção genuína, transparência e competência — o bem-estar do paciente é sempre prioridade.",
  },
  {
    title: "FAQ — Convênio",
    content:
      "A SouClinic aceita convênio ou plano de saúde? Não, atualmente o atendimento é só particular, para garantir qualidade de materiais e de profissionais.",
  },
  {
    title: "FAQ — Boleto",
    content:
      "Fechando o tratamento no boleto dá pra fazer tudo de uma vez? Não. O boleto facilita o acesso ao tratamento, mas o paciente precisa se manter adimplente. O planejamento alinha os boletos com os procedimentos contratados.",
  },
  {
    title: "FAQ — Estacionamento",
    content:
      "Águas Claras é ruim de estacionamento? A clínica fica em frente à Estação de Metrô Águas Claras — localização privilegiada, não precisa se preocupar em vir de carro.",
  },
  {
    title: "Objeção — sem dinheiro agora",
    content:
      "\"Não tenho dinheiro agora\": a clínica tem cartão de crédito e boleto, formas que não exigem aprovação de crédito prévia.",
  },
  {
    title: "Objeção — sem dinheiro pra primeira consulta",
    content:
      "\"Não tenho dinheiro pra primeira consulta\": a primeira consulta é personalizada, sem compromisso e sem custo — o paciente só começa a pagar quando o tratamento é iniciado.",
  },
  {
    title: "Objeção — vou ver depois",
    content:
      "\"Vou ver um dia que consigo ir e te aviso\": oferecer horário concreto (ex: hoje às 16h, amanhã às 9h) e reservar na hora, com tom acolhedor de prioridade, sem pressão.",
  },
  {
    title: "Regras e políticas",
    content:
      "Todo paciente que sai da SouClinic deve conseguir descrever a experiência com três palavras: Atenciosos (sentiu que foi ouvido, sem pressa, dúvida importou), Transparentes (entendeu o que foi feito, por quê, e quanto custa — sem surpresas), Competentes (saiu confiante do melhor tratamento possível).",
  },
  {
    title: "O que o SDR pode informar",
    content: "Localização, especialidades atendidas, horário de funcionamento, dias em que o especialista está na clínica, datas disponíveis para agendamento.",
  },
  {
    title: "O que o SDR não pode fazer",
    content:
      "Não pode: passar valores sem avaliação prévia; passar telefone pessoal do dentista; \"diagnosticar\" ou indicar tratamento por telefone; adotar postura hostil para forçar a presença na avaliação; gerar constrangimento no paciente; falar sem parar sem dar espaço para o paciente explicar sua necessidade.",
  },
  {
    title: "Valores do atendimento",
    content:
      "Ética acima de tudo (nunca indicar procedimento que não seja de real interesse do paciente); Transparência (clareza sobre diagnósticos, custos e expectativas); Competência com humildade; Acolhimento; Responsabilidade (quando erra, assume e corrige); Comprometimento com o paciente e o tratamento.",
  },
  {
    title: "Atendimento ruim — o que evitar",
    content:
      "Não ouvir o que o paciente realmente precisa (escuta ativa fraca reduz confirmação/comparecimento na avaliação); abandonar um paciente em tratamento; indicar procedimento por interesse financeiro da clínica em vez do interesse do paciente.",
  },
];
