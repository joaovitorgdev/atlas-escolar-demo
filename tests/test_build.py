"""Gera as planilhas fictícias numa pasta temporária, consolida com o build.py e confere os totais.

    python -m pytest -q
"""
import sqlite3, sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build import chave_escola, chave_sre, construir, gravar_db, quantidade  # noqa: E402
from gerar_dados_demo import gerar  # noqa: E402


@pytest.fixture(scope='module')
def base(tmp_path_factory):
    pasta = tmp_path_factory.mktemp('demo')
    n = gerar(pasta)
    d = construir(pasta / 'wifi.xlsx', pasta / 'parque.xlsx')
    gravar_db(d, pasta / 'infra.db')
    con = sqlite3.connect(pasta / 'infra.db')
    yield n, d, con
    con.close()


def test_conversoes():
    assert quantidade('Escola encerrada em 31/12/2025') == 0
    assert quantidade('0/15') == 0 and quantidade('12') == 12
    assert chave_escola('000027') == chave_escola(27.0) == '27'
    assert chave_sre(' SRE ARAÇUAÍ ') == 'ARAÇUAÍ'


def test_quantidade_de_escolas(base):
    n, d, con = base
    assert len(d['escolas']) == n
    assert con.execute('SELECT COUNT(*) FROM escola').fetchone()[0] == n


def test_47_regionais_e_toda_escola_tem_sre(base):
    _, _, con = base
    assert con.execute('SELECT COUNT(*) FROM sre').fetchone()[0] == 47
    assert con.execute('SELECT COUNT(*) FROM escola e LEFT JOIN sre s ON s.id = e.sre_id '
                       "WHERE s.id IS NULL OR s.nome = 'NÃO INFORMADA'").fetchone()[0] == 0


def test_todo_municipio_tem_feicao_no_mapa(base):
    _, _, con = base
    assert con.execute('SELECT COUNT(*) FROM municipio WHERE ibge = 0').fetchone()[0] == 0


def test_resumo_por_sre_fecha_com_o_total(base):
    _, _, con = base
    escolas, com_wifi, valor, alunos = con.execute(
        'SELECT COUNT(*), SUM(fase IN (1, 2) OR wifi = 2), SUM(total), SUM(alunos) FROM escola').fetchone()
    s_escolas, s_wifi, s_valor, s_alunos = con.execute(
        'SELECT SUM(escolas), SUM(com_wifi), SUM(investimento), SUM(alunos) FROM resumo_sre').fetchone()
    assert (s_escolas, s_wifi, s_alunos) == (escolas, com_wifi, alunos)
    assert s_valor == pytest.approx(valor, abs=0.5)   # a view arredonda cada regional antes de somar


def test_todas_as_escolas_do_parque_casaram(base):
    _, d, _ = base
    assert not [e for e in d['escolas'] if e.get('origem') == 'parque']
    assert sum(1 for e in d['escolas'] if e.get('parque')) > 0.9 * len(d['escolas'])


def test_gerador_e_deterministico(tmp_path):
    a, b = tmp_path / 'a', tmp_path / 'b'
    gerar(a), gerar(b)
    assert (a / 'wifi.xlsx').read_bytes() == (b / 'wifi.xlsx').read_bytes()
