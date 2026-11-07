import importlib.util
from pathlib import Path
import unittest
from caddy_guard import validate
spec = importlib.util.spec_from_file_location('original', Path(__file__).parents[1]/'https-test'/'validate_config.py')
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
spec2 = importlib.util.spec_from_file_location('fixtures', Path(__file__).parents[1]/'https-test'/'test_validate_config.py')
fixtures = importlib.util.module_from_spec(spec2)
import sys
sys.modules['validate_config'] = original
spec2.loader.exec_module(fixtures)


def config():
    value = fixtures.good_config()
    value['apps']['http']['servers']['https']['routes'] = [{'match':[{'host':['msg.zai.su']}], 'handle':[{'handler':'subroute','routes':[{'handle':[{'handler':'reverse_proxy','upstreams':[{'dial':'127.0.0.1:4318'}]}]}]}]}]
    return value


class GuardTest(unittest.TestCase):
    def test_good(self):
        self.assertEqual(validate(config(),original.validate),[8080,8443])

    def test_bad_upstream_or_host(self):
        for kind in ('host','upstream','no-match'):
            c=config()
            route=c['apps']['http']['servers']['https']['routes'][0]
            if kind=='host': route['match']=[{'host':['codex.zai.su']}]
            elif kind=='no-match': route.pop('match')
            else: route['handle'][0]['routes'][0]['handle'][0]['upstreams']=[{'dial':'0.0.0.0:443'}]
            with self.assertRaises(ValueError):validate(c,original.validate)

    def test_443_alpn_and_capability_ports_remain_forbidden(self):
        for kind in ('port','alpn','http'):
            c=config()
            if kind=='port':c['apps']['http']['servers']['https']['listen']=[':443']
            elif kind=='http':c['apps']['http']['servers']['http']['listen']=[':8080']
            else:c['apps']['tls']['automation']['policies'][0]['issuers'][0]['challenges']['tls-alpn']['disabled']=False
            with self.assertRaises(ValueError):validate(c,original.validate)
