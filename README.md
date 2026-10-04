# FENDA

As regras e a interface estão em [JOGO.md](JOGO.md). Esse arquivo acompanha o jogo: se a partida mudar, ele muda junto.

A fase de fábrica é a Claraboia. Mapas aprovados no editor entram na mesma rotação. Todo mundo nasce embaixo e a porta fica no alto. A escada só fica de pé se houver um bloco ou outro degrau embaixo.

Em cada rodada um jogador é o Shaman. A paleta fica na coluna da direita, junto da loja e do chat: primeiro escolhe o poder, depois clica dentro do círculo. Criar bloco, destruir, fortificar, escada e linha. A escavação normal não gasta mana. ESC cancela o poder.

## Rodar

```bash
npm install
npm test
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). Crie uma conta (apelido, e-mail e senha) e você cai direto numa sala. O nome da sala fica no topo; o padrão é `Galeria`. Quem digitar o mesmo nome entra na mesma partida.

O chat, a loja e a paleta do Shaman ficam na coluna à direita do mapa. A frase também aparece num balão sobre o operador.

Há um operador só. Sair pela porta rende moedas, e a loja nessa coluna vende viseira, casco, lanterna e faixa para ele.

As contas ficam em `server/data/users.json`. A sessão vale enquanto o servidor estiver no ar.

O servidor autoritativo fica em `ws://localhost:8787`.

## Controles

- `A` `D` ou setas: andar e virar
- `W` ou `↑`: subir escada
- `S` ou `↓`: cavar. Na linha, baixo solta.
- `X`: cavar sem descer
- Shaman: poder, depois o alvo no círculo. Andar, subir e cavar continuam nas mesmas teclas. Linha estende uma barra para atravessar pendurado.
- Na escada, `W` ou `↑` sobe e `S` ou `↓` desce. Sem um desses comandos, a queda continua. Se o bloco de apoio da escada for cavado, a escada cai.
- Na linha, esquerda e direita atravessam. Baixo solta.

O cliente envia só `{ "action": "DIG" }`. A célula destruída é calculada no servidor a partir da posição real, da direção e do grid.

## Painéis

O buraco da escavação e o do poder Destruir ficam abertos. O Shaman cria um tijolo em qualquer vão vazio, menos onde já tem alguém.
