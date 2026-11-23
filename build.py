"""Lê as planilhas do Wi-Fi e do parque tecnológico e gera o banco dados/infra.db e site/dados.js.

    python build.py                      # usa planilhas/wifi.xlsx e planilhas/parque.xlsx
    python build.py --wifi X.xlsx --parque Y.xlsx

Só biblioteca padrão: um .xlsx é um ZIP de XML. As colunas são achadas pelo
texto do cabeçalho (ver COLUNAS), então mover coluna não quebra nada.
"""
import argparse, json, math, re, sqlite3, sys, unicodedata, zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

RAIZ = Path(__file__).parent
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R_ID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

# Dados do projeto exibidos na aba "Projeto". Na demo, tudo fictício.
PROJETO = {
    'nome': 'Projeto Wi-Fi nas Escolas (demonstração)',
    'orgao': 'Órgão fictício — dados de demonstração',
    'empresa': 'Empresa Exemplo Ltda (fictícia)',
    'contrato': 'nº 0000/2024 (fictício)',
    'fonte': 'Recursos de conectividade escolar (exemplo)',
    'equipamentos': [
        ['Rede sem fio', 'Access Point interno', 'AP Wi-Fi 6 indoor', 'Genérico'],
        ['Rede sem fio', 'Access Point externo', 'AP Wi-Fi 6 outdoor', 'Genérico'],
        ['Rede cabeada', 'Switch PoE+', 'Switch 24 portas PoE+', 'Genérico'],
        ['Infraestrutura', 'Rack de equipamentos', 'Padronizado 19 pol.', 'Diversos'],
        ['Energia', 'Nobreak', 'Nobreak 700 VA', 'Diversos'],
    ],
}
PORTE_PONTOS = {'I': 11, 'II': 7, 'III': 6, 'IV': 5, 'V': 4, 'VI': 3}

ABAS = {
    'escolas': ['Cópia de EscolasTodas', 'EscolasTodas', 'Escolas'],
    'fase1': ['Cópia de FASE 1', 'FASE 1'],
    'fase2': ['FASE2', 'FASE 2'],
    'retiradas1': ['ESCOLAS RETIRADAS fase1'],
    'retiradas2': ['Escolas retiradas fase2'],
    'parque': ['MATRIZ', 'Parque'],
}
# Campo lógico -> apelidos de cabeçalho. O primeiro que casar (exato, depois prefixo) vence.
COLUNAS = {
    'escolas': dict(
        sre=['SRE'], inep=['INEP', 'COD INEP'], codigo=['Código da Escola', 'Código'],
        nome=['Estabelecimento de Ensino', 'Estabelecimento', 'Nome da Escola', 'Escola'],
        wifi=['Wi-Fi', 'WiFi'], fase1=['Contemplada Fase 1'], fase2=['Contemplada Fase 2'],
        localizacao=['Localização', 'Zona'], municipio=['Município'],
        endereco=['Endereço'], numero=['Número'], bairro=['Bairro'], cep=['CEP'], ddd=['DDD'],
        telefone=['Número Telefone', 'Telefone'], email=['E-mail', 'Email'], obs=['OBSERVAÇÕES', 'Obs']),
    'fase1': dict(
        sre=['SRE'], inep=['COD INEP', 'CodINEP', 'INEP'], nome=['ESTABELECIMENTO', 'Escola'],
        municipio=['MUNICIPIO'], porte=['PORTE DA ESCOLA', 'PORTE'], dataObra=['DATA DE ENTREGA DA OBRA'],
        dataVis1=['DATA PRIMEIRA VISITA NTE'], dataVisU=['DATA ÚLTIMA VISITA NTE'],
        status=['STATUS DAS ESCOLAS', 'STATUS'], pontos=['PONTOS INSTALADOS'],
        capital=['VALOR CAPITAL'], custeio=['VALOR CUSTEIO'], total=['TOTAL', 'VALOR TOTAL']),
    'fase2': dict(
        sre=['SRE', 'REGIONAL'], inep=['INEP', 'COD INEP'], nome=['Escola', 'ESTABELECIMENTO'],
        municipio=['Município'], endereco=['ENDEREÇO COMPLETO', 'Endereço'],
        dataObra=['DATA DE ENTREGA DA OBRA'], status=['STATUS'], dias=['DIAS SEM VISTORIA'],
        aps=['APs Internos', 'QTD APs INTERNOS'], pontos=['PONTOS INSTALADOS'],
        capital=['VALOR CAPITAL'], custeio=['VALOR CUSTEIO'], total=['TOTAL', 'VALOR TOTAL']),
    'retiradas': dict(
        sre=['SRE', 'REGIONAL'], inep=['CodINEP', 'INEP'], nome=['ESTABELECIMENTO', 'ESCOLA'],
        municipio=['MUNICÍPIO'], porte=['PORTE'], aps=['QTD APs INTERNOS'], motivo=['MOTIVO'],
        resolucao=['RESOLUÇÃO']),
    # Cabeçalhos da MATRIZ são frases longas que só divergem no fim: o texto exato vem primeiro.
    'parque': dict(
        sre=['SRE'], municipio=['Município'], codigo=['Código da Escola'], nome=['Estabelecimento de ensino'],
        alunos=['QUANTIDADE DE ALUNOS MATRICULADOS'],
        cbProfessor=['CHROMEBOOK Professor'], cbAluno=['CHROMEBOOK Aluno'], notebook=['NOTEBOOK Quantidade'],
        pc81=['COMPUTADOR Pregão 81 2021'], pc122=['COMPUTADOR Pregão 122 2017'],
        pc06=['COMPUTADOR Pregão 06 2015'], pcOutros=['COMPUTADOR Outros'],
        inservPc=['COMPUTADOR Quantidade com laudo'], inservCb=['CHROMEBOOK Quantidade com laudo'],
        inservNb=['NOTEBOOK Quantidade com laudo'], switches=['Quantidade de Switch'],
        impressoras=['Quantidade de impressora'], telas=['Qauntidade de Tela interativa', 'Quantidade de Tela interativa'],
        projetores=['Quantidade de projetor'], accessPoints=['Quantidade Access Point'],
        salaInfo=['A escola possui sala de informática'], desktopsSala=['Quantidade de desktop sala de informatica'],
        redeSala=['Qual a situação da rede elétrica e lógica'], links=['Quantos links contratados'],
        velTransf=['Qual a velocidade total em MEGAs dos links de internet contratados via Sistema de Transferência'],
        precoTransf=['Qual o preço mensal total dos links de internet contratados via Sistema de Transferência'],
        velPiec=['Qual a velocidade total em MEGAs dos links de internet contratados via PIEC'],
        precoPiec=['Qual o preço mensal total dos links de internet contratados via PIEC'],
        outrasConex=['Quais outras conexões possui'], atendimento=['Considerando todos os links de internet da escola'],
        possuiWifi=['A Escola possui Wi-Fi'], origemWifi=['Qual a origem deste Wi-Fi'],
        abrangencia=['O sinal do Wi-Fi abrange toda a Escola'], apsFaltantes=['Se não, qual o quantitativo adicional'],
        catVel=['Categoria de Velocidade']),
}

# ---------------------------------------------------------------- xlsx

def ler_xlsx(caminho):
    """{nome da aba: [linhas]} — cada linha é uma lista de valores (str, float ou bool)."""
    with zipfile.ZipFile(caminho) as z:
        return _ler_abas(z)


def _ler_abas(z):
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    comp = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            comp.append(''.join(t.text or '' for t in si.findall(f'{M}t') + si.findall(f'{M}r/{M}t')))
    abas = {}
    for aba in ET.fromstring(z.read('xl/workbook.xml')).find(f'{M}sheets'):
        alvo = rels[aba.get(R_ID)].lstrip('/')
        linhas = []
        for row in ET.fromstring(z.read(alvo if alvo.startswith('xl/') else 'xl/' + alvo)).iter(f'{M}row'):
            linha = []
            for c in row.iter(f'{M}c'):
                col = sum((ord(ch) - 64) * 26 ** i for i, ch in enumerate(reversed(re.match(r'[A-Z]+', c.get('r')).group())))
                t, v = c.get('t'), c.find(f'{M}v')
                if t == 'inlineStr':
                    val = ''.join(x.text or '' for x in c.iter(f'{M}t'))
                elif v is None or v.text is None:
                    continue
                elif t == 's':
                    val = comp[int(v.text)]
                elif t == 'b':
                    val = v.text == '1'
                elif t in ('str', 'e'):
                    val = v.text
                else:
                    val = float(v.text)
                linha += [''] * (col - 1 - len(linha)) + [val]
            linhas.append(linha)
        abas[aba.get('name')] = linhas
    return abas

# ---------------------------------------------------------------- conversões

NULOS = {'', '#REF!', '#N/A', '#VALUE!', '#DIV/0!', '-', '--', 'NULL', 'NÃO SE APLICA', 'NAO SE APLICA'}
CIENTIFICA = re.compile(r'^-?\d+(\.\d+)?[eE][+-]?\d+$')

def arred(x, casas=0):
    """Math.round do JS (meio para cima), não o arredondamento bancário do Python."""
    f = 10 ** casas
    return math.floor(x * f + 0.5) / f if casas else int(math.floor(x + 0.5))

def texto(v):
    if v is None:
        return ''
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else str(v)
    return str(v).strip()

def sem_acento(v):
    return ''.join(c for c in unicodedata.normalize('NFD', texto(v).upper()) if not unicodedata.combining(c))

def normalizar(v):
    return re.sub(r'[^A-Z0-9]', '', sem_acento(v))

def exibir(v):
    return re.sub(r'\s+', ' ', texto(v)).strip().upper()

def vazio(v):
    return texto(v).upper() in NULOS

def numero(v):
    if isinstance(v, float):
        return v if math.isfinite(v) else 0.0
    t = texto(v)
    if vazio(t):
        return 0.0
    t = re.sub(r'R\$|\s', '', t, flags=re.I)
    if CIENTIFICA.match(t):
        return float(t)
    if ',' in t:
        t = t.replace('.', '').replace(',', '.') if '.' in t else t.replace(',', '.')
    try:
        return float(re.sub(r'[^0-9.\-]', '', t) or 0)
    except ValueError:
        return 0.0

def inteiro(v):
    return arred(numero(v))

def quantidade(v):
    """Só vale o número que COMEÇA o texto: "0/15" -> 0, "Encerrada em 31/12/2025" -> 0."""
    if isinstance(v, float):
        return arred(v)
    t = texto(v)
    m = None if vazio(t) else re.match(r'\s*(\d+(?:[.,]\d+)?)', t)
    return arred(float(m.group(1).replace(',', '.'))) if m else 0

def codigo(v):
    if vazio(v):
        return ''
    if isinstance(v, float):
        return str(arred(v))
    t = texto(v)
    return str(arred(float(t))) if CIENTIFICA.match(t) else re.sub(r'\D', '', t)

def data_iso(v):
    def serial(n):
        return (date(1899, 12, 30) + timedelta(days=int(n))).isoformat()
    if isinstance(v, float):
        return serial(v) if 20000 < v < 80000 else ''
    t = texto(v)
    if vazio(t):
        return ''
    if m := re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$', t):
        ano = m[3] if len(m[3]) == 4 else '20' + m[3]
        return f'{ano}-{int(m[2]):02}-{int(m[1]):02}'
    if m := re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', t):
        return f'{m[1]}-{int(m[2]):02}-{int(m[3]):02}'
    n = numero(t)
    return serial(n) if 20000 < n < 80000 else ''

def booleano(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, float):
        return v > 0
    t = normalizar(v)
    return t in ('1', 'SIM', 'X', 'VERDADEIRO', 'TRUE') or t.startswith('CONTEMPLADA')

def sinal(v, positivo, negativo):
    """Resposta livre -> 1 / 0 / -1 (sem informação)."""
    t = normalizar(v)
    return 1 if t and t.startswith(positivo) else 0 if t and t.startswith(negativo) else -1

def chave_sre(v):
    t = exibir(v)
    s = sem_acento(t)
    if s.startswith('SRE '):
        t = t[4:]
    elif s.startswith('SUPERINTENDENCIA REGIONAL DE ENSINO'):
        t = re.sub(r'^\S+\s+\S+\s+\S+\s+\S+\s*(DE\s+)?', '', t, flags=re.I)
    return t.strip()

APELIDOS_MUN = {'SAOTOMEDASLETRAS': 'SAOTHOMEDASLETRAS', 'BARAODOMONTEALTO': 'BARAODEMONTEALTO', 'DONAEUZEBIA': 'DONAEUSEBIA'}

def chave_mun(v):
    k = normalizar(v)
    return APELIDOS_MUN.get(k, k)

def chave_escola(v):
    """Uma planilha guarda 184381, a outra "000027": sem os zeros à esquerda, os códigos casam."""
    return codigo(v).lstrip('0')

# ---------------------------------------------------------------- abas

def achar_aba(abas, apelidos):
    chaves = {normalizar(n): n for n in abas}
    for a in map(normalizar, apelidos):
        if a in chaves:
            return abas[chaves[a]]
    for a in map(normalizar, apelidos):
        for k, n in chaves.items():
            if a in k or k in a:
                return abas[n]
    return None

def registros(abas, aba, mapa):
    """Linhas da aba como dicts {campo lógico: valor}."""
    linhas = achar_aba(abas, ABAS[aba])
    if not linhas:
        return []
    cab = [normalizar(c) for c in linhas[0]]
    pos = {}
    for campo, apelidos in COLUNAS[mapa].items():
        alvos = [normalizar(a) for a in apelidos]
        pos[campo] = next((cab.index(a) for a in alvos if a in cab),
                          next((i for a in alvos for i, c in enumerate(cab) if a and c.startswith(a)), -1))
    return [{c: (l[p] if 0 <= p < len(l) else '') for c, p in pos.items()} for l in linhas[1:]]

# ---------------------------------------------------------------- consolidação

class Base:
    def __init__(self):
        self.sres, self.sre_ix, self.muns, self.mun_ix = [], {}, [], {}
        self.escolas, self.por_inep, self.por_codigo = [], {}, {}

    def sre(self, v):
        nome = chave_sre(v) or 'NÃO INFORMADA'
        k = re.sub(r'\s+', ' ', sem_acento(nome)).strip()   # "ARAÇUAÍ" (Wi-Fi) == "ARACUAI" (MATRIZ)
        if k not in self.sre_ix:
            self.sre_ix[k] = len(self.sres)
            self.sres.append(nome)
        return self.sre_ix[k]

    def mun(self, v):
        k = chave_mun(v) or 'SEMMUNICIPIO'
        if k not in self.mun_ix:
            self.mun_ix[k] = len(self.muns)
            self.muns.append(exibir(v) or 'NÃO INFORMADO')
        return self.mun_ix[k]

    def nova(self, **campos):
        e = dict(PADRAO, **campos)
        self.escolas.append(e)
        return e

    def por_fase(self, r, fase):
        inep = codigo(r['inep'])
        if inep in self.por_inep:
            return self.por_inep[inep]
        e = self.nova(inep=inep, nome=texto(r['nome']) or '(sem nome)', sre=self.sre(r['sre']),
                      mun=self.mun(r['municipio']), wifi=1, fase=fase, origem='fase')
        if inep:
            self.por_inep[inep] = e
        return e

# Valor padrão de cada campo — o que é igual ao padrão não vai para dados.js.
PADRAO = dict(
    inep='', codigo='', nome='', sre=0, mun=0, zona=0, wifi=0, fase=0, porte='', pontos=0, aps=0,
    capital=0, custeio=0, total=0, status='', dataObra='', dataVis1='', dataVisU='',
    dias=-1, endereco='', numero='', bairro='', cep='', telefone='', email='', obs='', origem='',
    alunos=0, dispositivos=0, velocidade=0, custoNet=0, atendimento=-1, salaInfo=-1, wifiProprio=-1, parque=None,
)

def escolas_base(b, rs):
    for r in rs:
        nome, inep = texto(r['nome']), codigo(r['inep'])
        if not nome and not inep:
            continue
        w = normalizar(r['wifi'])
        loc = normalizar(r['localizacao'])
        fase = next((i for i in (1, 2) if booleano(r[f'fase{i}'])), 0)
        tel = ' '.join(filter(None, [texto(r['ddd']), texto(r['telefone'])]))
        e = b.nova(inep=inep, codigo=codigo(r['codigo']), nome=nome, sre=b.sre(r['sre']), mun=b.mun(r['municipio']),
                   zona=2 if 'RURAL' in loc else 1 if 'DISTRITO' in loc else 0,
                   wifi=2 if 'ENEC' in w else 1 if w.startswith('CONTEMPLADA') else 0, fase=fase,
                   endereco=texto(r['endereco']), numero=texto(r['numero']), bairro=texto(r['bairro']),
                   cep=texto(r['cep']), telefone=tel, email=texto(r['email']),
                   obs='' if vazio(r['obs']) else texto(r['obs']))
        if inep:
            b.por_inep[inep] = e
        if k := chave_escola(e['codigo']):
            b.por_codigo[k] = e

def fase1(b, rs):
    vistos = set()
    for r in rs:
        inep, nome = codigo(r['inep']), texto(r['nome'])
        if not inep and not nome:
            continue
        e = b.por_fase(r, 1)
        e['fase'], e['wifi'] = 1, e['wifi'] or 1
        capital, custeio = numero(r['capital']), numero(r['custeio'])
        total, pontos = numero(r['total']) or capital + custeio, inteiro(r['pontos'])
        if (inep or nome) in vistos:   # complemento de instalação: soma, como a planilha
            e['pontos'] += pontos; e['capital'] += capital; e['custeio'] += custeio; e['total'] += total
        else:
            e.update(pontos=pontos, capital=capital, custeio=custeio, total=total, porte=normalizar(r['porte']),
                     status=exibir(r['status']), dataObra=data_iso(r['dataObra']),
                     dataVis1=data_iso(r['dataVis1']), dataVisU=data_iso(r['dataVisU']))
        vistos.add(inep or nome)
        e['dataObra'] = e['dataObra'] or data_iso(r['dataObra'])
        e['status'] = e['status'] or exibir(r['status'])

def fase2(b, rs):
    vistos, escolas = set(), []
    for r in rs:
        inep, nome = codigo(r['inep']), texto(r['nome'])
        if not inep and not nome:
            continue
        e = b.por_fase(r, 2)
        e['fase'], e['wifi'] = 2, e['wifi'] or 1
        pontos, aps, dias = inteiro(r['pontos']), inteiro(r['aps']), r['dias']
        capital, custeio = numero(r['capital']), numero(r['custeio'])
        total = numero(r['total']) or capital + custeio
        if (inep or nome) in vistos:
            e['pontos'] += pontos; e['aps'] += aps; e['capital'] += capital; e['custeio'] += custeio; e['total'] += total
            if e['dias'] < 0 and not vazio(dias):
                e['dias'] = inteiro(dias)
        else:
            escolas.append(e)
            e.update(pontos=pontos, aps=aps, capital=capital, custeio=custeio, total=total,
                     status=exibir(r['status']), dataObra=data_iso(r['dataObra']),
                     dias=-1 if vazio(dias) else inteiro(dias))
        vistos.add(inep or nome)
        e['dataObra'] = e['dataObra'] or data_iso(r['dataObra'])
        e['endereco'] = e['endereco'] or texto(r['endereco'])
    for e in escolas:
        e['porte'] = e['porte'] or next((p for p, n in PORTE_PONTOS.items() if n == (e['pontos'] or e['aps'])), '')

def parque(b, rs):
    por_nome = {}
    for e in b.escolas:
        por_nome.setdefault(f"{normalizar(e['nome'])}|{e['mun']}", e)
    for r in rs:
        nome, cod = texto(r['nome']), chave_escola(r['codigo'])
        if not nome and not cod:
            continue
        mun = b.mun(r['municipio'])
        e = (cod and b.por_codigo.get(cod)) or por_nome.get(f'{normalizar(nome)}|{mun}')
        if not e:
            e = b.nova(codigo=cod, nome=nome or '(sem nome)', sre=b.sre(r['sre']), mun=mun, origem='parque')
            if cod:
                b.por_codigo[cod] = e
        q = {k: quantidade(r[k]) for k in ('alunos cbProfessor cbAluno notebook pc81 pc122 pc06 pcOutros inservPc '
                                            'inservCb inservNb switches impressoras telas projetores accessPoints '
                                            'desktopsSala links apsFaltantes').split()}
        t = {k: '' if vazio(r[k]) else exibir(r[k]) for k in
             'salaInfo redeSala outrasConex atendimento possuiWifi origemWifi abrangencia catVel'.split()}
        v = {k: numero(r[k]) for k in ('velTransf', 'precoTransf', 'velPiec', 'precoPiec')}
        p = {k: x for k, x in {**q, **t, **v}.items() if x}
        e['parque'] = p
        e['codigo'] = e['codigo'] or cod
        e.update(alunos=q['alunos'],
                 dispositivos=q['cbProfessor'] + q['cbAluno'] + q['notebook'] + q['pc81'] + q['pc122'] + q['pc06'] + q['pcOutros'],
                 velocidade=v['velTransf'] + v['velPiec'], custoNet=v['precoTransf'] + v['precoPiec'],
                 atendimento=sinal(t['atendimento'], 'ADEQUADO', 'INSUFICIENTE'),
                 salaInfo=sinal(t['salaInfo'], 'SIM', 'NAO'), wifiProprio=sinal(t['possuiWifi'], 'SIM', 'NAO'))

def retiradas(rs, fase):
    return [dict(fase=fase, inep=codigo(r['inep']), nome=texto(r['nome']), sre=chave_sre(r['sre']),
                 mun=exibir(r['municipio']), porte=normalizar(r['porte']), aps=inteiro(r['aps']),
                 motivo=texto(r['motivo']), resolucao=texto(r['resolucao']))
            for r in rs if texto(r['nome'])]

def construir(wifi_xlsx, parque_xlsx=None):
    abas = ler_xlsx(wifi_xlsx)
    if parque_xlsx and Path(parque_xlsx).exists():
        abas.update(ler_xlsx(parque_xlsx))
    b = Base()
    escolas_base(b, registros(abas, 'escolas', 'escolas'))
    if not b.escolas:
        raise SystemExit(f'Aba de escolas não encontrada em {wifi_xlsx}.')
    fase1(b, registros(abas, 'fase1', 'fase1'))
    fase2(b, registros(abas, 'fase2', 'fase2'))
    parque(b, registros(abas, 'parque', 'parque'))
    # Município -> código IBGE da feição do mapa (0 = sem feição).
    vinculo = json.loads((RAIZ / 'fontes/municipio_sre.json').read_text(encoding='utf-8'))
    por_nome = {chave_mun(n): int(c) for c, (n, _) in vinculo.items()}
    return dict(
        geradoEm=datetime.now(timezone.utc).isoformat(timespec='seconds'),
        projeto=PROJETO, sres=b.sres, municipios=b.muns,
        munIbge=[por_nome.get(chave_mun(n), 0) for n in b.muns],
        padrao={k: v for k, v in PADRAO.items() if k != 'parque'},
        escolas=[{k: v for k, v in e.items() if v != PADRAO[k]} for e in b.escolas],
        retiradas=retiradas(registros(abas, 'retiradas1', 'retiradas'), 1) + retiradas(registros(abas, 'retiradas2', 'retiradas'), 2),
    )

REAIS = {'capital', 'custeio', 'total', 'velocidade', 'custoNet'}

def gravar_db(d, caminho):
    """Banco SQLite com o conjunto consolidado — consultável com SQL, DB Browser, Power BI ou Excel."""
    caminho.parent.mkdir(exist_ok=True)
    caminho.unlink(missing_ok=True)
    tipo = lambda k, v: 'REAL' if k in REAIS else 'TEXT' if isinstance(v, str) else 'INTEGER'
    nome = {'sre': 'sre_id', 'mun': 'municipio_id'}
    campos = [k for k in d['padrao']]
    q_parque = [k for k in COLUNAS['parque'] if k not in ('sre', 'municipio', 'codigo', 'nome')]
    with sqlite3.connect(caminho) as con:
        con.executescript(f"""
            CREATE TABLE sre (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE);
            CREATE TABLE municipio (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, ibge INTEGER);
            CREATE TABLE escola (id INTEGER PRIMARY KEY, {', '.join(f'{nome.get(k, k)} {tipo(k, v)}' for k, v in d['padrao'].items())},
                FOREIGN KEY (sre_id) REFERENCES sre(id), FOREIGN KEY (municipio_id) REFERENCES municipio(id));
            CREATE TABLE parque (escola_id INTEGER PRIMARY KEY REFERENCES escola(id), {', '.join(q_parque)});
            CREATE TABLE retirada (fase INTEGER, inep TEXT, nome TEXT, sre TEXT, municipio TEXT, porte TEXT, aps INTEGER, motivo TEXT, resolucao TEXT);
            CREATE TABLE projeto (chave TEXT PRIMARY KEY, valor);
            CREATE INDEX escola_inep ON escola(inep);
            CREATE VIEW resumo_sre AS
              SELECT s.nome AS sre, COUNT(*) AS escolas,
                     SUM(e.fase IN (1, 2) OR e.wifi = 2) AS com_wifi,
                     ROUND(100.0 * SUM(e.fase IN (1, 2) OR e.wifi = 2) / COUNT(*), 1) AS cobertura_pct,
                     SUM(e.fase = 0 AND e.wifi <> 2 AND e.obs <> '') AS nao_recebera,
                     SUM(e.pontos) AS pontos, ROUND(SUM(e.total), 2) AS investimento,
                     SUM(e.alunos) AS alunos, SUM(e.dispositivos) AS dispositivos,
                     ROUND(1.0 * SUM(e.alunos) / NULLIF(SUM(e.dispositivos), 0), 1) AS alunos_por_dispositivo,
                     ROUND(SUM(e.velocidade) / NULLIF(SUM(e.alunos), 0), 2) AS mbps_por_aluno,
                     SUM(e.atendimento = 0) AS internet_insuficiente, ROUND(SUM(e.custoNet), 2) AS internet_mensal
              FROM escola e JOIN sre s ON s.id = e.sre_id GROUP BY s.id;""")
        con.executemany('INSERT INTO sre VALUES (?, ?)', enumerate(d['sres']))
        con.executemany('INSERT INTO municipio VALUES (?, ?, ?)', ((i, n, d['munIbge'][i]) for i, n in enumerate(d['municipios'])))
        escolas = [{**d['padrao'], **e} for e in d['escolas']]
        con.executemany(f'INSERT INTO escola VALUES ({", ".join("?" * (len(campos) + 1))})',
                        ((i, *(e[k] for k in campos)) for i, e in enumerate(escolas)))
        con.executemany(f'INSERT INTO parque VALUES ({", ".join("?" * (len(q_parque) + 1))})',
                        ((i, *(e['parque'].get(k) for k in q_parque)) for i, e in enumerate(escolas) if e.get('parque')))
        con.executemany('INSERT INTO retirada VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        ([r[k] for k in ('fase', 'inep', 'nome', 'sre', 'mun', 'porte', 'aps', 'motivo', 'resolucao')] for r in d['retiradas']))
        con.executemany('INSERT INTO projeto VALUES (?, ?)', ((k, json.dumps(v, ensure_ascii=False) if isinstance(v, list) else v)
                                                               for k, v in {**d['projeto'], 'geradoEm': d['geradoEm']}.items()))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--wifi', default=RAIZ / 'planilhas/wifi.xlsx')
    ap.add_argument('--parque', default=RAIZ / 'planilhas/parque.xlsx')
    a = ap.parse_args()
    d = construir(a.wifi, a.parque)
    js = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    # Malha do IBGE (API de malhas v3, UF 31, qualidade mínima) + vínculo município -> SRE(s), dados públicos.
    ibge = json.loads((RAIZ / 'fontes/ibge_mg.geojson').read_text(encoding='utf-8'))
    vinculo = json.loads((RAIZ / 'fontes/municipio_sre.json').read_text(encoding='utf-8'))
    sre_ix = {sem_acento(n): i for i, n in enumerate(d['sres'])}
    red = lambda c: [red(x) for x in c] if isinstance(c[0], list) else [round(c[0], 3), round(c[1], 3)]   # ~100 m
    geo = dict(
        mapa={'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'properties': {'name': f['properties']['codarea']},
             'geometry': {'type': f['geometry']['type'], 'coordinates': red(f['geometry']['coordinates'])}}
            for f in ibge['features']]},
        mun={c: [n, [sre_ix[sem_acento(s)] for s in sres]] for c, (n, sres) in vinculo.items()},
    )
    (RAIZ / 'site/mapa.js').write_text(f'window.GEO_MG={js(geo)};\n', encoding='utf-8')
    (RAIZ / 'site/dados.js').write_text(f'window.DADOS={js(d)};\n', encoding='utf-8')
    gravar_db(d, RAIZ / 'dados/infra.db')
    total = sum(e.get('total', 0) for e in d['escolas'])
    print(f"{len(d['escolas'])} escolas · {len(d['sres'])} SREs · Fases 1 e 2 R$ {total:,.2f} -> dados/infra.db, site/dados.js")

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
