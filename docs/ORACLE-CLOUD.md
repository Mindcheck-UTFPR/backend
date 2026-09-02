# Deploy na Oracle Cloud Free Tier

Este guia registra a proposta inicial. Os comandos finais devem ser testados pelo grupo antes da demonstração.

## Componentes

- uma VM compatível com a oferta gratuita da Oracle Cloud;
- Docker e Docker Compose;
- Nginx como proxy reverso e servidor do frontend;
- container Node.js para a API;
- container PostgreSQL com volume persistente;
- HTTPS com certificado renovável.

## Passos

1. Criar a VM e confirmar no console que o recurso pertence à oferta gratuita.
2. Configurar chave SSH pessoal sem colocá-la no repositório.
3. Liberar somente SSH, HTTP e HTTPS no firewall; PostgreSQL não deve ficar público.
4. Instalar Docker e o plugin Compose.
5. Definir variáveis de produção fora do Git.
6. Subir os serviços, validar health checks e configurar HTTPS.
7. Configurar backup e executar pelo menos um teste de restauração.
8. Registrar deploy e rollback em um checklist curto.

## Cuidados com custo e segurança

- Criar alerta de orçamento e revisar os limites atuais da conta gratuita.
- Não assumir que todo recurso exibido no console é gratuito.
- Manter sistema e imagens atualizados.
- Não registrar IP, senha, token ou chave privada neste arquivo.
- Usar dados fictícios no ambiente de demonstração.
