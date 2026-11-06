from copy import deepcopy
import unittest
from report import amount, read_interface, render, validate_initial_history


def sample():
    return {'jsonversion':'2','interfaces':[{'name':'eth1','updated':{'timestamp':1793997078},'traffic':{
        'total':{'tx':100_000_000,'rx':900_000_000},
        'hour':[{'date':{'year':2026,'month':11,'day':6},'time':{'hour':23},'tx':100_000_000}],
        'day':[], 'month':[],
    }}]}


class ReportTests(unittest.TestCase):
    def test_decimal_gb_matches_declared_units(self):
        self.assertIn('1.000000 GB', amount(1_000_000_000))

    def test_missing_data_is_an_error_not_zero(self):
        with self.assertRaises(ValueError): read_interface({'jsonversion':'2','interfaces':[]})
        data=sample(); del data['interfaces'][0]['traffic']['total']['tx']
        with self.assertRaises(KeyError): read_interface(data)

    def test_refuses_negative_or_noninteger_bytes(self):
        for value in (-1, 0.5, True, '100'):
            with self.assertRaises(ValueError): amount(value)

    def test_tx_is_separate_from_rx(self):
        text=render(sample(),{'meter_started_at_utc':'2026-11-06T20:30:00+00:00'})
        self.assertIn('TX исходящий с начала истории: 100.000 MB',text)
        self.assertIn('RX входящий с начала истории: 900.000 MB',text)
        self.assertNotIn('1.000000 GB',text)
        self.assertIn('2026-11-06 23:00',text)

    def test_provider_value_is_not_imported_into_meter(self):
        metadata={'meter_started_at_utc':'2026-11-06T20:30:00+00:00','provider_observation':{'display_gb':'1.13','recorded_at_utc':'2026-11-06T20:29:51+00:00'}}
        text=render(deepcopy(sample()),metadata)
        self.assertIn('100.000 MB (0.100000 GB)',text)
        self.assertIn('1.13 GB',text)
        self.assertIn('не импортируется',text)

    def test_initialization_does_not_import_existing_kernel_total(self):
        metadata={'kernel_at_start':{'tx_bytes':1_000_000_000,'rx_bytes':2_000_000_000}}
        kernel={'tx_bytes':1_200_000_000,'rx_bytes':3_000_000_000}
        validate_initial_history(sample(),metadata,kernel)
        bad=sample(); bad['interfaces'][0]['traffic']['total']['tx']=1_100_000_000
        with self.assertRaises(ValueError): validate_initial_history(bad,metadata,kernel)


if __name__ == '__main__': unittest.main()
