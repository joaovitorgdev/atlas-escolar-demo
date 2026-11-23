"""Abre o painel nesta máquina:  python rodar.py [porta]

Gera as planilhas fictícias se não existirem e refaz os dados se alguma planilha
em planilhas/ for mais nova que site/dados.js. Só escuta em 127.0.0.1.
Ctrl+C (ou fechar a janela) para parar.
"""
import functools, http.server, sys, webbrowser
from pathlib import Path

from build import RAIZ, main as build
from gerar_dados_demo import gerar

SITE = RAIZ / 'site'
PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

planilhas = list((RAIZ / 'planilhas').glob('*.xlsx'))
dados = SITE / 'dados.js'
if not planilhas and not dados.exists():
    gerar()
    planilhas = list((RAIZ / 'planilhas').glob('*.xlsx'))
if planilhas and (not dados.exists() or any(p.stat().st_mtime > dados.stat().st_mtime for p in planilhas)):
    sys.argv = sys.argv[:1]   # o build tem os próprios argumentos
    build()


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):   # sem uma linha por arquivo na janela
        pass


manipulador = functools.partial(Silencioso, directory=SITE)
try:
    servidor = http.server.ThreadingHTTPServer(('127.0.0.1', PORTA), manipulador)
except OSError:   # porta ocupada: o sistema escolhe uma livre
    servidor = http.server.ThreadingHTTPServer(('127.0.0.1', 0), manipulador)
url = f'http://127.0.0.1:{servidor.server_port}/'
print('Atlas Escolar — demo (dados fictícios)')
print(f'Painel aberto no navegador: {url}')
print('Para encerrar, Ctrl+C ou feche esta janela.')
webbrowser.open(url)
try:
    servidor.serve_forever()
except KeyboardInterrupt:
    pass
