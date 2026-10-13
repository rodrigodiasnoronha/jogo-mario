# clone — mapeamento do quiz pilatespro

Script Playwright que abre https://quiz.pilatespro.site/, espera o JS montar a tela e percorre o quiz etapa por etapa.

```bash
cd clone
npm install
node map-flow.mjs                      # escolhe sempre a 1ª opção
node map-flow.mjs --choice=random      # outro caminho (útil p/ achar ramificações)
node map-flow.mjs --headed --max=80    # com janela visível
```

Saída em `out/`:
- `FLOW.md` — resumo legível de cada etapa (pergunta, opções, CTAs, ação tomada)
- `flow.json` — dados completos por etapa
- `screens/NN.png` e `html/NN.html` — screenshot e DOM renderizado de cada etapa
- `network.json`, `console.log` — requisições (inclui pixels/envio de lead) e logs
- `assets/` — JS/CSS/imagens baixados
- `trace.zip` — abrir com `npx playwright show-trace out/trace.zip`

Formulários são preenchidos com dados fictícios (`teste@example.com`, etc.).
