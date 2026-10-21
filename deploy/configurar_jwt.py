"""Provisionar JWT_SEGREDO apenas quando ausente, sem imprimir seu valor."""
import os
import re
import secrets
import shlex
import sys
import tempfile
from pathlib import Path


def configurar(arquivo):
    arquivo = Path(arquivo)
    if arquivo.is_symlink() or not arquivo.is_file():
        raise ValueError('O .env deve ser um arquivo regular, sem link simbolico')
    if hasattr(os, 'getuid') and arquivo.stat().st_uid != os.getuid():
        raise ValueError('O .env deve pertencer ao usuario de deploy')
    original = arquivo.read_bytes()
    texto = original.decode('utf-8')
    padrao = re.compile(r'^[ \t]*(?:export[ \t]+)?JWT_SEGREDO[ \t]*=([^\r\n]*)', re.M)
    encontrados = list(padrao.finditer(texto))
    if len(encontrados) > 1:
        raise ValueError('JWT_SEGREDO duplicado; revisar o ambiente sem sobrescrever valores')
    if encontrados:
        valores = shlex.split(encontrados[0].group(1), comments=True)
        if valores and any(valores):
            if len(valores) != 1 or len(valores[0]) < 32 or valores[0].lower().startswith(('segredo-de-teste', 'changeme', 'defina')):
                raise ValueError('JWT_SEGREDO existente invalido; rotacao exige decisao explicita')
            return 'preservado'
    segredo = secrets.token_hex(64)
    linha = 'JWT_SEGREDO=' + segredo
    if encontrados:
        achado = encontrados[0]
        novo = texto[:achado.start()] + linha + texto[achado.end():]
    else:
        novo = texto + ('' if not texto or texto.endswith('\n') else '\n') + linha + '\n'
    # Backup e arquivo temporario privados, no mesmo filesystem para troca atomica.
    with tempfile.NamedTemporaryFile(prefix='.env.before-jwt.', dir=arquivo.parent, delete=False) as backup:
        os.chmod(backup.name, 0o600)
        backup.write(original)
        backup.flush()
        os.fsync(backup.fileno())
    temporario = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.env.jwt.', dir=arquivo.parent, delete=False) as saida:
            temporario = saida.name
            os.chmod(temporario, 0o600)
            saida.write(novo.encode('utf-8'))
            saida.flush()
            os.fsync(saida.fileno())
        os.replace(temporario, arquivo)
    finally:
        if temporario and os.path.exists(temporario):
            os.unlink(temporario)
    return 'adicionado'


if __name__ == '__main__':
    import fcntl
    if len(sys.argv) != 2 or not re.fullmatch(r'/[a-zA-Z0-9/_-]+', sys.argv[1]) or sys.argv[1] == '/':
        raise SystemExit('Diretorio de deploy invalido')
    raiz = Path(sys.argv[1]).resolve(strict=True)
    with open(raiz / 'deploy.lock', 'a') as trava:
        fcntl.flock(trava, fcntl.LOCK_EX)
        resultado = configurar(raiz / '.env')
    print('JWT_SEGREDO ' + resultado + '; valor nao exibido')
