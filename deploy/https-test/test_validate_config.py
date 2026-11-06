import copy
import unittest
from validate_config import validate


def good_config():
    return {
        'admin': {'disabled': True},
        'apps': {
            'http': {'https_port': 8443, 'servers': {
                'http': {'listen': ['127.0.0.1:8080'], 'protocols': ['h1', 'h2'], 'automatic_https': {'disable_redirects': True}},
                'https': {'listen': [':8443'], 'protocols': ['h1', 'h2'], 'automatic_https': {'disable_redirects': True}},
            }},
            'tls': {'automation': {'policies': [{'issuers': [{
                'module': 'acme', 'ca': 'https://acme-v02.api.letsencrypt.org/directory',
                'challenges': {'tls-alpn': {'disabled': True}, 'http': {'alternate_port': 8080}},
            }]}]}},
        },
    }


class ConfigGuardTests(unittest.TestCase):
    def test_expected_configuration(self):
        self.assertEqual(validate(good_config()), [8080, 8443])

    def test_rejects_port_443(self):
        config = good_config()
        config['apps']['http']['servers']['https']['listen'] = [':443']
        with self.assertRaises(ValueError):
            validate(config)

    def test_rejects_alpn_fallback(self):
        config = good_config()
        del config['apps']['tls']['automation']['policies'][0]['issuers'][0]['challenges']['tls-alpn']
        with self.assertRaises(ValueError):
            validate(config)

    def test_rejects_public_challenge_backend(self):
        config = good_config()
        config['apps']['http']['servers']['http']['listen'] = [':8080']
        with self.assertRaises(ValueError):
            validate(config)

    def test_rejects_proxy_to_real_application(self):
        config = good_config()
        config['apps']['http']['servers']['https']['routes'] = [{'handle': [{'handler': 'reverse_proxy'}]}]
        with self.assertRaises(ValueError):
            validate(config)

    def test_rejects_dns01_and_other_issuers(self):
        for change in ('dns', 'issuer'):
            config = copy.deepcopy(good_config())
            issuer = config['apps']['tls']['automation']['policies'][0]['issuers'][0]
            if change == 'dns':
                issuer['challenges']['dns'] = {}
            else:
                config['apps']['tls']['automation']['policies'][0]['issuers'].append({'module': 'internal'})
            with self.assertRaises(ValueError):
                validate(config)


if __name__ == '__main__':
    unittest.main()
