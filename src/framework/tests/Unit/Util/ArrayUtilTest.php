<?php

namespace Tests\Unit\Util;

use PHPUnit\Framework\TestCase;
use stdClass;
use Util\ArrayUtil;

class ArrayUtilTest extends TestCase
{
    /**
     * utoMapのテスト
     * 
     * @dataProvider case_utoMap
     *
     * @param array $data
     * @param callable $func
     * @param array $expected
     * @return void
     */
    public function test_utoMap(array $data, callable $func, array $expected)
    {
        $result = ArrayUtil::utoMap($data, $func);
        foreach ($expected as $expectedKey => $expectedRow) {
            // 想定通りの値がキーとしてデータと紐づいているか
            $this->assertSame($expectedRow, $result[$expectedKey]);
        }
    }
    public function case_utoMap()
    {
        return [
            // 配列
            [
                [
                    ['key' => 'key1', 'val' => 'val1'],
                    ['key' => 'key2', 'val' => 'val2'],
                    ['key' => 'key3', 'val' => 'val3'],
                ],
                function (array $row) {return $row['key'];},
                [
                    'key1' => ['key' => 'key1', 'val' => 'val1'],
                    'key2' => ['key' => 'key2', 'val' => 'val2'],
                    'key3' => ['key' => 'key3', 'val' => 'val3'],
                ]
            ],
            // オブジェクト
            [
                [
                    $obj1 = (object) ['key' => 'key1', 'val' => 'val1'],
                    $obj2 = (object) ['key' => 'key2', 'val' => 'val2'],
                    $obj3 = (object) ['key' => 'key3', 'val' => 'val3'],
                ],
                function (stdClass $row) {return $row->key;},
                [
                    'key1' => $obj1,
                    'key2' => $obj2,
                    'key3' => $obj3,
                ]
            ],
        ];
    }
}
