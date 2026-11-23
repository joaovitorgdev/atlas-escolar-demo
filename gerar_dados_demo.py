"""Gera planilhas FICTÍCIAS no formato que o build.py espera.

    python gerar_dados_demo.py            # escreve planilhas/wifi.xlsx e planilhas/parque.xlsx
    python gerar_dados_demo.py outra/pasta

Nenhum dado real: nomes de escola inventados, códigos INEP de 8 dígitos começando
com 9 (fora da faixa real), números sorteados com semente fixa (sempre o mesmo resultado).
Só a geografia é real e pública: as 47 regionais (SREs) e os municípios de MG (IBGE).

Só biblioteca padrão: um .xlsx é um ZIP de XML; aqui cada célula de texto vai como
"inlineStr", que o leitor do build.py entende.
"""
import json, random, sys, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

RAIZ = Path(__file__).parent
TOTAL_ESCOLAS = 1200
SEMENTE = 2026
PORTE_PONTOS = {'I': 11, 'II': 7, 'III': 6, 'IV': 5, 'V': 4, 'VI': 3}

TITULOS_F = ['Professora', 'Dona', 'Doutora', 'Irmã', 'Poetisa', '']
TITULOS_M = ['Professor', 'Doutor', 'Padre', 'Maestro', 'Poeta', '']
NOMES = ['Ana', 'Benedita', 'Carmelita', 'Dalva', 'Eulália', 'Floriana', 'Germana', 'Hilda', 'Iracema',
         'Jandira', 'Laurinda', 'Marieta', 'Nair', 'Odete', 'Palmira', 'Quitéria', 'Rosalva', 'Sebastiana',
         'Teodora', 'Ubaldina', 'Vicentina', 'Zulmira', 'Aristides', 'Belmiro', 'Cândido', 'Deodato',
         'Epaminondas', 'Firmino', 'Gumercindo', 'Honório', 'Isidoro', 'Juvenal', 'Leopoldo', 'Modesto',
         'Nestor', 'Olegário', 'Plácido', 'Romualdo', 'Saturnino', 'Tibúrcio', 'Valdomiro', 'Zacarias']
SOBRENOMES = ['Lima', 'Andrade', 'Bastos', 'Coutinho', 'Diniz', 'Fagundes', 'Guimarães', 'Horta', 'Junqueira',
              'Lacerda', 'Magalhães', 'Nogueira', 'Ottoni', 'Pimenta', 'Quintão', 'Resende', 'Sampaio',
              'Teixeira', 'Valadares', 'Vasconcelos', 'Brandão', 'Campos', 'Drummond', 'Ferraz', 'Gouveia']
TEMAS = ['Vale Verde', 'Serra Azul', 'Bela Aurora', 'Campo Florido', 'Pedra Branca', 'Rio Claro',
         'Boa Esperança', 'Sol Nascente', 'Três Pontes', 'Mata Alta', 'Ipê Amarelo', 'Cachoeira Grande']
RUAS = ['Rua das Flores', 'Rua Principal', 'Avenida Central', 'Rua do Rosário', 'Praça da Matriz',
        'Rua São José', 'Avenida Brasil', 'Rua da Escola', 'Travessa do Comércio']
BAIRROS = ['Centro', 'Vila Nova', 'Jardim América', 'São Francisco', 'Boa Vista', 'Santa Luzia', 'Industrial']
MOTIVOS_SEM_WIFI = ['Prédio em reforma geral', 'Escola funciona em prédio cedido', 'Mudança de endereço prevista',
                    'Escola encerrada em 31/12/2025', 'Sem rede elétrica adequada para instalação']

ESCOLAS_CAB = ['SRE', 'INEP', 'Código da Escola', 'Estabelecimento de Ensino', 'Wi-Fi', 'Contemplada Fase 1',
               'Contemplada Fase 2', 'Localização', 'Município', 'Endereço', 'Número', 'Bairro', 'OBSERVAÇÕES']
FASE1_CAB = ['SRE', 'COD INEP', 'ESTABELECIMENTO', 'MUNICIPIO', 'PORTE DA ESCOLA', 'DATA DE ENTREGA DA OBRA',
             'DATA PRIMEIRA VISITA NTE', 'DATA ÚLTIMA VISITA NTE', 'STATUS DAS ESCOLAS', 'PONTOS INSTALADOS',
             'VALOR CAPITAL', 'VALOR CUSTEIO', 'TOTAL']
FASE2_CAB = ['SRE', 'INEP', 'Escola', 'Município', 'ENDEREÇO COMPLETO', 'DATA DE ENTREGA DA OBRA', 'STATUS',
             'DIAS SEM VISTORIA', 'APs Internos', 'PONTOS INSTALADOS', 'VALOR CAPITAL', 'VALOR CUSTEIO', 'TOTAL']
RETIRADAS_CAB = ['SRE', 'CodINEP', 'ESTABELECIMENTO', 'MUNICÍPIO', 'PORTE', 'QTD APs INTERNOS', 'MOTIVO', 'RESOLUÇÃO']
PARQUE_CAB = [
    'SRE', 'Município', 'Código da Escola', 'Estabelecimento de ensino', 'QUANTIDADE DE ALUNOS MATRICULADOS',
    'CHROMEBOOK Professor', 'CHROMEBOOK Aluno', 'NOTEBOOK Quantidade', 'COMPUTADOR Pregão 81 2021',
    'COMPUTADOR Pregão 122 2017', 'COMPUTADOR Pregão 06 2015', 'COMPUTADOR Outros', 'COMPUTADOR Quantidade com laudo',
    'CHROMEBOOK Quantidade com laudo', 'NOTEBOOK Quantidade com laudo', 'Quantidade de Switch',
    'Quantidade de impressora', 'Quantidade de Tela interativa', 'Quantidade de projetor', 'Quantidade Access Point',
    'A escola possui sala de informática', 'Quantidade de desktop sala de informatica',
    'Qual a situação da rede elétrica e lógica', 'Quantos links contratados',
    'Qual a velocidade total em MEGAs dos links de internet contratados via Sistema de Transferência',
    'Qual o preço mensal total dos links de internet contratados via Sistema de Transferência',
    'Qual a velocidade total em MEGAs dos links de internet contratados via PIEC',
    'Qual o preço mensal total dos links de internet contratados via PIEC',
    'Quais outras conexões possui', 'Considerando todos os links de internet da escola', 'A Escola possui Wi-Fi',
    'Qual a origem deste Wi-Fi', 'O sinal do Wi-Fi abrange toda a Escola', 'Se não, qual o quantitativo adicional',
    'Categoria de Velocidade']


# ---------------------------------------------------------------- xlsx mínimo

def _col(i):
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _celula(ref, v):
    if v is None or v == '':
        return ''
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return f'<c r="{ref}"><v>{v}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'


def escrever_xlsx(caminho, abas):
    """abas: {nome: [linhas]}; a primeira linha é o cabeçalho."""
    main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    pkg = 'http://schemas.openxmlformats.org/package/2006/relationships'
    nomes = list(abas)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(caminho, 'w', zipfile.ZIP_DEFLATED) as z:
        # data fixa no ZIP: mesmo conteúdo, mesmos bytes
        escrever = lambda nome, xml: z.writestr(zipfile.ZipInfo(nome, (2026, 1, 1, 0, 0, 0)), xml, zipfile.ZIP_DEFLATED)
        escrever('[Content_Types].xml',
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                             for i in range(1, len(nomes) + 1)) + '</Types>')
        escrever('_rels/.rels', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{pkg}">'
                   f'<Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        escrever('xl/workbook.xml', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="{main}" xmlns:r="{rel}"><sheets>'
                   + ''.join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, n in enumerate(nomes, 1))
                   + '</sheets></workbook>')
        escrever('xl/_rels/workbook.xml.rels', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{pkg}">'
                   + ''.join(f'<Relationship Id="rId{i}" Type="{rel}/worksheet" Target="worksheets/sheet{i}.xml"/>'
                             for i in range(1, len(nomes) + 1)) + '</Relationships>')
        for i, n in enumerate(nomes, 1):
            linhas = ''.join(f'<row r="{r}">' + ''.join(_celula(f'{_col(c)}{r}', v) for c, v in enumerate(l)) + '</row>'
                             for r, l in enumerate(abas[n], 1))
            escrever(f'xl/worksheets/sheet{i}.xml', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                       f'<worksheet xmlns="{main}"><sheetData>{linhas}</sheetData></worksheet>')


# ---------------------------------------------------------------- dados fictícios

def _data(rnd, ano=2025):
    return f'{rnd.randint(1, 28):02}/{rnd.randint(1, 12):02}/{ano}'


def _nome(rnd, usados):
    while True:
        if rnd.random() < 0.15:
            n = f'E.E. {rnd.choice(TEMAS)}'
        else:
            nome = rnd.choice(NOMES)
            t = rnd.choice(TITULOS_F if NOMES.index(nome) < 22 else TITULOS_M)   # 22 primeiros nomes são femininos
            n = ' '.join(filter(None, ['E.E.', t, nome, rnd.choice(SOBRENOMES), rnd.choice(SOBRENOMES)]))
        if n not in usados:
            usados.add(n)
            return n


def _municipios_por_sre():
    vinculo = json.loads((RAIZ / 'fontes/municipio_sre.json').read_text(encoding='utf-8'))
    por_sre = {}
    for nome, sres in vinculo.values():
        for s in sres:
            por_sre.setdefault(s, []).append(nome)
    return {s: sorted(m) for s, m in sorted(por_sre.items())}


def _escolas(rnd, n):
    por_sre = _municipios_por_sre()
    sres = list(por_sre)
    pesos = [rnd.uniform(0.5, 2.0) for _ in sres]
    usados, escolas = set(), []
    for i in range(n):
        sre = sres[i] if i < len(sres) else rnd.choices(sres, pesos)[0]   # toda SRE tem ao menos uma
        sorteio = rnd.random()
        fase = 1 if sorteio < 0.6 else 2 if sorteio < 0.7 else 0
        wifi = 'Contemplada' if fase else 'ENEC' if sorteio < 0.75 else 'Não contemplada'
        escolas.append(dict(
            sre=sre, mun=rnd.choice(por_sre[sre]), nome=_nome(rnd, usados),
            inep=str(rnd.randint(90000000, 99899999)), codigo=9000001 + i,
            fase=fase, wifi=wifi, porte=rnd.choice(list(PORTE_PONTOS)),
            zona=rnd.choices(['Urbana', 'Rural', 'Distrito'], [70, 22, 8])[0],
            obs=rnd.choice(MOTIVOS_SEM_WIFI) if wifi == 'Não contemplada' and rnd.random() < 0.15 else ''))
    vistos = set()
    for e in escolas:   # INEP único
        while e['inep'] in vistos:
            e['inep'] = str(int(e['inep']) + 1)
        vistos.add(e['inep'])
    return escolas


def _valores(rnd, pontos):
    capital = round(pontos * rnd.uniform(2400, 3600), 2)
    custeio = round(capital * rnd.uniform(0.12, 0.25), 2)
    return capital, custeio, round(capital + custeio, 2)


def _planilha_wifi(rnd, escolas):
    base = [ESCOLAS_CAB] + [
        [e['sre'], e['inep'], e['codigo'], e['nome'], e['wifi'], 'SIM' if e['fase'] == 1 else '',
         'SIM' if e['fase'] == 2 else '', e['zona'], e['mun'], rnd.choice(RUAS), rnd.randint(10, 2500),
         rnd.choice(BAIRROS), e['obs']] for e in escolas]
    fase1 = [FASE1_CAB]
    for e in (e for e in escolas if e['fase'] == 1):
        pontos = PORTE_PONTOS[e['porte']]
        status = rnd.choices(['INSTALAÇÃO CONCLUÍDA', 'EM INSTALAÇÃO', 'VISTORIA APROVADA'], [60, 15, 25])[0]
        fase1.append([e['sre'], e['inep'], e['nome'], e['mun'], e['porte'], _data(rnd, 2024), _data(rnd, 2024),
                      _data(rnd), status, pontos, *_valores(rnd, pontos)])
        if rnd.random() < 0.03:   # complemento de instalação: segunda linha da mesma escola, somada pelo build
            fase1.append([e['sre'], e['inep'], e['nome'], e['mun'], '', '', '', '', '', 1, *_valores(rnd, 1)])
    fase2 = [FASE2_CAB]
    for e in (e for e in escolas if e['fase'] == 2):
        aps = PORTE_PONTOS[e['porte']]
        status = rnd.choices(['AGUARDANDO VISTORIA', 'VISTORIA APROVADA', 'VISTORIA REPROVADA'], [45, 45, 10])[0]
        dias = rnd.randint(5, 180) if status == 'AGUARDANDO VISTORIA' else ''
        fase2.append([e['sre'], e['inep'], e['nome'], e['mun'], f"{rnd.choice(RUAS)}, {rnd.randint(10, 2500)}",
                      _data(rnd), status, dias, aps, aps, *_valores(rnd, aps)])
    sem = [e for e in escolas if e['fase'] == 0]
    retiradas = lambda motivo: [RETIRADAS_CAB] + [
        [e['sre'], e['inep'], e['nome'], e['mun'], e['porte'], PORTE_PONTOS[e['porte']], motivo, 'Reavaliar no próximo ciclo']
        for e in rnd.sample(sem, 8)]
    return {'EscolasTodas': base, 'FASE 1': fase1, 'FASE2': fase2,
            'ESCOLAS RETIRADAS fase1': retiradas('Escola com obra estrutural em andamento'),
            'Escolas retiradas fase2': retiradas('Prédio sem condições de receber a instalação')}


def _parque(rnd, e):
    alunos = rnd.randint(60, 1800)
    sala = rnd.random() < 0.88
    vel_t = rnd.choice([0, 100, 200, 300, 400, 500, 600])
    vel_p = rnd.choice([0, 0, 100, 200, 300, 500])
    vel = vel_t + vel_p
    cat = '0-300' if vel <= 300 else '301-600' if vel <= 600 else '601-1000' if vel <= 1000 else '>1000'
    wifi = rnd.random() < 0.7
    adequado = vel / alunos > 0.35 or rnd.random() < 0.3
    return [e['sre'], e['mun'], str(e['codigo']).zfill(9), e['nome'], alunos,
            rnd.randint(2, 30), int(alunos * rnd.uniform(0.03, 0.3)), rnd.randint(0, 20), rnd.randint(0, 25),
            rnd.randint(0, 15), rnd.randint(0, 8), rnd.randint(0, 5), rnd.randint(0, 12), rnd.randint(0, 10),
            rnd.randint(0, 4), rnd.randint(0, 4), rnd.randint(1, 6), rnd.randint(0, 10), rnd.randint(0, 6),
            rnd.randint(0, 12), 'Sim' if sala else 'Não', rnd.randint(8, 30) if sala else 0,
            rnd.choice(['Boa', 'Regular', 'Precária']) if sala else '', rnd.randint(1, 3),
            vel_t, round(vel_t * rnd.uniform(0.6, 1.4), 2) if vel_t else 0,
            vel_p, round(vel_p * rnd.uniform(0.6, 1.4), 2) if vel_p else 0,
            rnd.choice(['Nenhuma', 'Rádio', '4G', 'Satélite']), 'Adequado' if adequado else 'Insuficiente',
            'Sim' if wifi else 'Não', rnd.choice(['Projeto estadual', 'Recursos próprios', 'Doação']) if wifi else '',
            rnd.choice(['Sim', 'Não']) if wifi else '', rnd.randint(1, 8) if wifi and rnd.random() < 0.4 else 0, cat]


def gerar(destino=RAIZ / 'planilhas', n=TOTAL_ESCOLAS):
    """Escreve wifi.xlsx e parque.xlsx em destino. Devolve o número de escolas."""
    rnd = random.Random(SEMENTE)
    destino = Path(destino)
    escolas = _escolas(rnd, n)
    escrever_xlsx(destino / 'wifi.xlsx', _planilha_wifi(rnd, escolas))
    escrever_xlsx(destino / 'parque.xlsx', {'MATRIZ': [PARQUE_CAB] + [_parque(rnd, e) for e in escolas if rnd.random() < 0.95]})
    return len(escolas)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    destino = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / 'planilhas'
    print(f'{gerar(destino)} escolas fictícias -> {destino / "wifi.xlsx"}, {destino / "parque.xlsx"}')
