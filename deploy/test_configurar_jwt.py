import tempfile
import unittest
from pathlib import Path
from configurar_jwt import configurar


class ConfigurarJwtTeste(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta.cleanup)
        self.arquivo = Path(self.pasta.name) / '.env'

    def test_gerar_e_preservar_na_reexecucao(self):
        original = b'DATABASE_URL=exemplo-local\n# comentario\n'
        self.arquivo.write_bytes(original)
        self.assertEqual(configurar(self.arquivo), 'adicionado')
        novo = self.arquivo.read_bytes()
        self.assertTrue(novo.startswith(original))
        self.assertRegex(novo.decode(), r'JWT_SEGREDO=[a-f0-9]{128}\n$')
        backups = list(self.arquivo.parent.glob('.env.before-jwt.*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original)
        self.assertEqual(configurar(self.arquivo), 'preservado')
        self.assertEqual(self.arquivo.read_bytes(), novo)

    def test_preencher_valor_vazio_sem_mudar_outras_linhas(self):
        for vazio in ('', '""', "''", ' # ausente'):
            self.arquivo.write_text('OUTRA=ok\nJWT_SEGREDO=' + vazio + '\nFIM=ok\n')
            self.assertEqual(configurar(self.arquivo), 'adicionado')
            self.assertRegex(self.arquivo.read_text(), r'^OUTRA=ok\nJWT_SEGREDO=[a-f0-9]{128}\nFIM=ok\n$')

    def test_preservar_segredo_existente(self):
        original = 'export JWT_SEGREDO="' + 'a' * 64 + '" # preservar\n'
        self.arquivo.write_text(original)
        self.assertEqual(configurar(self.arquivo), 'preservado')
        self.assertEqual(self.arquivo.read_text(), original)

    def test_rejeitar_valor_fraco(self):
        self.arquivo.write_text('JWT_SEGREDO=fraco\n')
        with self.assertRaises(ValueError):
            configurar(self.arquivo)
        self.assertEqual(self.arquivo.read_text(), 'JWT_SEGREDO=fraco\n')

    def test_rejeitar_duplicados(self):
        self.arquivo.write_text('JWT_SEGREDO=\nJWT_SEGREDO=\n')
        with self.assertRaises(ValueError):
            configurar(self.arquivo)

    def test_rejeitar_arquivo_ausente(self):
        with self.assertRaises(ValueError):
            configurar(self.arquivo)


if __name__ == '__main__':
    unittest.main()
