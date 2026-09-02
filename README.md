# PlayDrop V2 🎮⬇️

Comparador de preços de jogos para PC com identidade visual retrô e ofertas em reais.

## O que existe na V2

- Home renovada com ranking de mais comprados e seleção de promoções populares.
- Carrosséis com setas, arraste, toque e rolagem do mouse sem bloquear a página.
- Um card por jogo, reunindo as ofertas disponíveis em várias lojas.
- Página individual de cada jogo com comparador completo de preços.
- Catálogo com pesquisa, quantidade de resultados e filtros por loja, desconto, preço e ativação.
- Ordenação por relevância, popularidade, maior desconto e menor preço.
- Lista de desejos e histórico salvos no navegador.
- Acompanhamento local de preços com indicação de novo menor preço ou valor próximo do mínimo.
- Layout responsivo para computador, tablet e celular.
- Backend Flask com cache, eliminação de duplicados e curadoria de jogos conhecidos.

## Regra de ofertas para o Brasil

O backend só entrega uma oferta ao frontend quando o provedor a identifica como compatível com o Brasil. A região funciona como regra interna e não aparece nos cards.

Fontes preparadas:

- Steam Brasil, ativa por padrão.
- IsThereAnyDeal, quando `ITAD_API_KEY` estiver configurada.
- Nuuvem, quando `NUUVEM_API_TOKEN` estiver configurado.

## Estrutura

```text
PlayDrop/
├── backend/
│   ├── app.py
│   ├── providers/
│   │   ├── steam.py
│   │   ├── itad.py
│   │   └── nuuvem.py
│   ├── requirements.txt
│   └── .env.example
├── database/
│   └── playdrop.sql
└── frontend/
    ├── index.html
    ├── catalogo.html
    ├── jogo.html
    ├── assets/
    ├── css/style.css
    └── js/app.js
```

## Rodar no Windows

No PowerShell, entre na pasta `backend` e execute:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Abra `http://127.0.0.1:5000`.

## Render

Com o repositório conectado ao Render, use:

- Build command: `pip install -r backend/requirements.txt`
- Start command: `gunicorn --chdir backend app:app`

Cada envio para a branch principal pode iniciar um novo deploy automático.
