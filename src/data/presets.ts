import { SecurityPreset } from "../types";

export const securityPresets: SecurityPreset[] = [
  {
    id: "standard",
    name: "Detecção Geral",
    description: "Monitoramento balanceado para pessoas, veículos, animais e objetos em qualquer ambiente.",
    instructionContext: "Priorize identificar com precisão qualquer pessoa, animal doméstico, veículo ou pacote abandonado.",
  },
  {
    id: "perimeter",
    name: "Perímetro & Quintal",
    description: "Foco em intrusões perimetrais, pessoas pulando cerca/muro ou paradas observando a propriedade.",
    instructionContext: "ÁREA DE ALTA PRIORIDADE: Qualquer indivíduo não identificado próximo a muros, grades ou portão deve disparar alerta de severidade HIGH se estiver parado, sondando ou pulando.",
  },
  {
    id: "delivery",
    name: "Portaria & Encomendas",
    description: "Detecta entregadores, pacotes deixados no chão da entrada e portas/portões abertos.",
    instructionContext: "FOCO EM ENTREGAS: Identifique pacotes, encomendas e caixas deixadas em frente a portas. Se houver entregador ou pacote novo, dispare alerta com resumo descritivo claro.",
  },
  {
    id: "garage",
    name: "Garagem & Animais",
    description: "Monitora veículos em manobra, portão da garagem aberto e animais soltos perto de carros.",
    instructionContext: "FOCO EM GARAGEM: Identifique se há animais (como cães ou gatos) soltos próximos aos pneus ou área de manobra de veículos para evitar atropelamentos.",
  },
];
