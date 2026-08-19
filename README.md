# PlayDrop 🎮⬇️

Comparador de promoções de jogos para PC com identidade visual 8-bit retrô.

## V1

A primeira versão entrega:

- Home responsiva em estilo 8-bit.
- Seção horizontal **Promoções Imperdíveis** com scroll do mouse.
- Cards com selo de desconto e preço abaixo da capa.
- Hover com menor preço histórico, loja, preço e plataforma de ativação.
- Busca de jogos em promoção.
- Animações pixeladas: moedas, seta de queda, parallax, brilho e fade.
- Backend em Flask.
- Estrutura MySQL para jogos, lojas e histórico de preços.
- Regra de segurança regional: o frontend só recebe provedores marcados como compatíveis com o Brasil.

## Fonte de dados nesta V1

A V1 usa a API pública do CheapShark para buscar promoções de PC. Como essa fonte não informa de forma confiável a restrição regional de chaves de revendedores externos, o feed ao vivo da V1 fica restrito à **Steam**. Isso evita mostrar uma chave externa sem confirmação de ativação no Brasil.

A arquitetura está pronta para adicionar Nuuvem, Green Man Gaming e Instant Gaming quando houver uma fonte de dados que também permita validar a compatibilidade regional da oferta.

> Os preços retornados pela integração atual são exibidos em USD porque essa é a moeda entregue pela fonte utilizada nesta versão.

## Estrutura

```text
playdrop-v1/
├── backend/
│   ├── app.py
│   ├── database.py
│   ├── requirements.txt
│   ├── .env.example
│   └── services/
│       └── cheapshark.py
├── database/
│   └── playdrop.sql
├── frontend/
│   ├── index.html
│   ├── assets/
│   │   └── playdrop-logo.png
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── .gitignore
└── README.md
```

## Rodar no Windows

### 1. Abrir o projeto

No PowerShell:

```powershell
cd C:\caminho\para\playdrop-v1\backend
```

### 2. Criar ambiente virtual

```powershell
python -m venv .venv
```

### 3. Ativar

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
```

### 4. Instalar dependências

```powershell
pip install -r requirements.txt
```

### 5. Executar

```powershell
python app.py
```

Abra:

```text
http://127.0.0.1:5000
```

## MySQL / XAMPP

O site já funciona sem o banco para consultar as promoções da V1. Para preparar o histórico de preços:

1. Inicie Apache e MySQL no XAMPP.
2. Abra o phpMyAdmin.
3. Importe `database/playdrop.sql`.
4. Copie `backend/.env.example` para `backend/.env` e ajuste a senha do MySQL se necessário.

## Próximas integrações planejadas

- Nuuvem
- Green Man Gaming
- Instant Gaming
- Favoritos
- Alertas de preço
- Histórico persistente no MySQL

## Observação

Links de ofertas obtidos pela CheapShark devem continuar usando o redirecionamento fornecido pela própria API.


## Correções 1.0.1

- Cards responsivos em desktop, tablet e celular.
- Imagens não são mais esticadas; agora preservam a proporção original.
- Painel de ofertas adaptado para telas menores.
- A V1 continua mostrando apenas Steam porque somente essa origem está marcada como validada para a regra de ativação no Brasil.
