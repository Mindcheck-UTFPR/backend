# Oracle Cloud — MIND-86

API e PostgreSQL usam `compose.production.yml`; o Nginx da VM publica `/api/` por HTTPS. O banco não publica portas e a API aceita conexões apenas pelo loopback da VM.

## Infraestrutura

- Ubuntu 24.04 x86_64 em `VM.Standard.E2.1.Micro`, elegível ao Always Free na região principal da conta.
- Disco de boot padrão, sem volumes adicionais. Swap de 2 GiB no próprio disco para builds na máquina de 1 GiB.
- Docker Engine + Compose plugin, Nginx e Certbot instalados pelas fontes oficiais.
- Entrada TCP 22 (SSH com chave), 80 (redirecionamento e validação TLS) e 443 (aplicação). Não liberar 3000/5432.
- Verificar os limites atuais da [Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm). Recursos gratuitos ociosos podem ser recuperados; não fazer upgrade da conta nem adicionar recursos pagos.

## Configuração da VM

Criar `/opt/mindcheck/backend` e `/opt/mindcheck/frontend`, pertencentes ao usuário de deploy com acesso ao Docker. Manter `/opt/mindcheck/backend/.env` com permissão `600`, fora do Git:

```dotenv
POSTGRES_PASSWORD=SUBSTITUA_POR_SENHA_ALEATORIA
DATABASE_URL=postgresql://mindcheck:SUBSTITUA_POR_SENHA_ALEATORIA@postgres:5432/mindcheck
CORS_ORIGIN=https://SEU_DOMINIO
```

Usar uma senha aleatória hexadecimal ou codificar caracteres reservados na URL. O volume persistente é `mindcheck_production_postgres`. `prisma/init.sql` roda somente na primeira inicialização de um volume vazio. Mudanças futuras de schema precisam de migração explícita; nunca apagar o volume para atualizar a aplicação.

Instalar `nginx.conf` em `/etc/nginx/sites-available/mindcheck`, substituir o domínio e habilitar o site. Configurar certificado HTTPS com renovação automática via Certbot. O frontend deve existir em `/opt/mindcheck/frontend/current`.

## GitHub Actions

Configurar em cada repositório o environment `production`. Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY` e `DEPLOY_KNOWN_HOSTS`. O caminho neste repositório é `/opt/mindcheck/backend`. A identidade SSH da VM deve corresponder à chave pública registrada em `known_hosts`; os jobs recusam alteração da chave do servidor.

Variables do repositório: `DEPLOY_ENABLED=true` habilita a publicação da branch `main`; `PUBLIC_URL` aponta ao endpoint HTTPS `/api/health/ready`. Manter a chave privada fora de arquivos versionados e limitar acesso de escrita aos workflows. A conta de deploy com acesso ao Docker pode administrar a VM.

O job executa lint, testes e build; envia o arquivo do commit testado; constrói a imagem; espera os healthchecks; verifica PostgreSQL e HTTPS. Releases ficam em `releases/<SHA>`, com `current` atualizado somente após sucesso. Se a inicialização dos containers falhar, o script tenta iniciar a release anterior. Rollback não reverte migrações do banco.

Para republicar uma release já enviada: `bash deploy/publish.sh /opt/mindcheck/backend SHA_COMPLETO`. Não executar `docker compose down -v` em produção. Fazer backup com `pg_dump` antes de mudanças no banco e guardar cópia fora da VM; o disco único não oferece recuperação contra perda da instância.

As alterações entram por PR em `develop` e seguem o processo de release para `main`; não fazer merge automático sem revisão.
