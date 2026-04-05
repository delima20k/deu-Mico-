# Ícones PWA — Deu Mico

Esta pasta deve conter os ícones PNG do app em todos os tamanhos.

## Tamanhos necessários

| Arquivo         | Tamanho   | Uso                        |
|-----------------|-----------|----------------------------|
| icon-72.png     | 72×72     | Android legacy             |
| icon-96.png     | 96×96     | Android                    |
| icon-128.png    | 128×128   | Chrome Web Store           |
| icon-144.png    | 144×144   | Windows / IE11             |
| icon-152.png    | 152×152   | iOS retina iPad            |
| icon-192.png    | 192×192   | Android home screen ⭐     |
| icon-384.png    | 384×384   | Android splash             |
| icon-512.png    | 512×512   | Play Store / instalação ⭐ |

## Gerar os ícones

Execute na raiz do projeto:

```bash
node generate-icons.js
```

O script copia `/img/carta_logo.png` em todos os tamanhos como placeholder.
Para ícones de qualidade, use ferramentas como:
- https://www.pwabuilder.com/imageGenerator
- https://realfavicongenerator.net
- `sharp` CLI: `npx sharp-cli resize <w> <h> --input carta_logo.png`

## Fallback em produção

Enquanto os ícones físicos não existirem, o `vercel.json` redireciona
qualquer `/icons/icon-*.png` para `/img/carta_logo.png` automaticamente.
