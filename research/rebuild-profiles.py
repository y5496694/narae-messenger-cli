"""Extract schema identities from installed products, retaining exact byte provenance.

Does not execute target programs, copy vendor binaries, or read account caches.
REA Evidence referenced here must already have been collected for these artifacts.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

PRODUCTS = {
    'goe': ('goe', 'ultari-atmessenger7', 'AtMessengerMobileEdition.exe', 'Client.ini', 'APP_NAME', 'GOE메신저', 'goe-native', '7.0.2', 'https://ultari.co.kr/goe/file/AtMessenger7Enable_Banner_Setup.exe'),
    'gbe': ('gbe', 'ultari-atmessenger7', 'AtMessengerMobileEdition.exe', 'Client.ini', 'APP_NAME', 'GBeeTALK', 'gbe-native', '7.0.2', 'https://www.gbe.kr/us/na/ntt/selectNttInfo.do?mi=6355&bbsId=2508&nttSn=1370718'),
    'kwe': ('gwe', 'ucware-delphi', 'ucware_m.exe', 'ucw_config.ini', 'program_title', '이음(EUM)', 'gwe-native', '678', 'https://www.gwe.go.kr/main/bbs/view.do?bbsSn=53811&key=bTIzMDcyMTExOTkyNzQ%3D'),
    'gne': ('gne', 'ucware-delphi', 'ucware_m.exe', 'ucw_config.ini', 'program_title', '아이좋아 메신저', 'gne-native', '706', 'https://hyedu.gne.go.kr/hyedu/na/ntt/selectNttInfo.do?nttSn=2509524'),
    'jje': ('jje', 'ucware-delphi', 'ucware_m.exe', 'ucw_config.ini', 'program_title', '제주특별자치도교육청 메신저', 'jje-imports', '746', 'https://www.jje.go.kr/index.jje?menuCd=DOM_000000109003000000'),
    'jbe': ('jbe', 'ultari-atmessenger7', 'AtMessengerMobileEdition.exe', 'Client.ini', 'APP_NAME', 'JBEdu Messenger+', 'jbe-native', '7.0.2', 'https://www.jbedu.kr/index.jbedu?menuCd=DOM_000000513001000000'),
}


def schemas(binary):
    result = {}
    patterns = [('ascii', rb'[\x09\x0a\x0d\x20-\x7e]{8,}'), ('utf-16le', rb'(?:[\x09\x0a\x0d\x20-\x7e]\x00){8,}')]
    for encoding, pattern in patterns:
        for match in re.finditer(pattern, binary):
            text = match.group().decode(encoding)
            # A string can contain a leading alignment byte; keep the exact SQL offset.
            sql = re.search(r'CREATE\s+TABLE\s+(tbl\w+)\s*\((.+)\)', text, re.I | re.S)
            if not sql:
                continue
            name, body = sql.groups()
            columns = re.findall(r'(?:^|,)\s*(\w+)\s+(?:VARCHAR2?|CHAR|TEXT|BLOB|INTEGER|INT|NUMBER)\b', body, re.I)
            if not columns:
                continue
            entry = result.setdefault(name, {'columns': [], 'locations': []})
            entry['columns'] = sorted(set(entry['columns']) | set(columns))
            entry['locations'].append({'fileOffset': match.start() + sql.start() * (2 if encoding == 'utf-16le' else 1), 'encoding': encoding})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='D:/Codex/apps/regional-messengers')
    parser.add_argument('--evidence-dir', default='D:/Codex/tmp')
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[1] / 'drivers/profiles.json'))
    args = parser.parse_args()
    profiles = {}
    for region, (directory, family, executable, config, key, title, evidence, version, source) in PRODUCTS.items():
        binary = (Path(args.root) / directory / executable).read_bytes()
        sha256 = hashlib.sha256(binary).hexdigest()
        record = json.loads((Path(args.evidence_dir) / (evidence + '-rea-20261101.json')).read_text(encoding='utf-8-sig'))
        if record['subject']['digest']['sha256'] != sha256 or record['normalized_result'].get('artifact_changed'):
            raise ValueError('REA artifact mismatch: ' + region)
        text = (Path(args.root) / directory / config).read_text(encoding='cp949')
        if not re.search(r'^' + key + r'\s*=\s*' + re.escape(title) + r'\s*$', text, re.M):
            raise ValueError('regional product mismatch: ' + region)
        tables = schemas(binary)
        expected = ['tblMessage', 'tblChatContent', 'tblChatRoomInfo'] if family == 'ultari-atmessenger7' else ['tbl_message', 'tbl_chat', 'tbl_users']
        if not all(name in tables for name in expected):
            raise ValueError('missing native schema: ' + region + ' ' + str(list(tables)))
        profiles[region] = {
            'installDirectory': directory, 'family': family, 'product': title,
            'executable': executable, 'sha256': sha256, 'installerVersion': version,
            'config': {'file': config, 'encoding': 'euc-kr', 'key': key, 'value': title},
            'reaEvidence': record['evidence_id'], 'source': source,
            'nativeSchemas': {name: tables[name] for name in expected},
            'installed': True, 'runtimeVerified': False, 'authenticatedLiveTested': False,
        }
    Path(args.output).write_text(json.dumps(profiles, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({key: {'sha256': value['sha256'], 'tables': list(value['nativeSchemas'])} for key, value in profiles.items()}, ensure_ascii=False))


if __name__ == '__main__':
    main()
