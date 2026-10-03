# FENDA

As regras e a interface estão em [JOGO.md](JOGO.md). Esse arquivo acompanha o jogo: se a partida mudar, ele muda junto.

A fase jogável é a Claraboia. Todo mundo nasce embaixo e a porta fica no alto. A escada só fica de pé se houver um bloco ou outro degrau embaixo.

Em cada rodada um jogador é o Shaman. A paleta fica ao lado do chat: primeiro escolhe o poder, depois clica no bloco. Destruir marca o tijolo, restaurar fecha um buraco e fortificar torna o tijolo estrutural. A escavação normal não gasta mana. ESC cancela o poder.

## Rodar

```bash
npm install
npm test
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). Crie uma conta (apelido, e-mail e senha) e você cai direto numa sala. O nome da sala fica no topo; o padrão é `Galeria`. Quem digitar o mesmo nome entra na mesma partida.

O chat fica na barra de baixo. A frase também aparece num balão sobre o operador.

Os personagens são pixel art original do jogo (`lume`, `brasa`, `nico`, `voga`, `iris`, `cabo`). A conta guarda o id, que é o gancho para um marketplace futuro.

As contas ficam em `server/data/users.json`. A sessão vale enquanto o servidor estiver no ar.

O servidor autoritativo fica em `ws://localhost:8787`.

## Controles

- `A` `D` ou setas: andar e virar
- `W` ou `↑`: subir escada
- `S` ou `↓`: cavar
- `X`: cavar sem descer
- Shaman: clique no tijolo para marcá-lo. Andar, subir e cavar continuam nas mesmas teclas.
- Na escada, `W` ou `↑` sobe e `S` ou `↓` desce. Sem um desses comandos, a queda continua. Se o bloco de apoio da escada for cavado, a escada cai.

O cliente envia só `{ "action": "DIG" }`. A célula destruída é calculada no servidor a partir da posição real, da direção e do grid.

## Painéis

O buraco da escavação e o do poder Destruir ficam abertos. O tijolo só volta quando o Shaman usa Restaurar. Se alguém estiver dentro nesse momento, é eliminado.
