<?php

namespace Util;

use InvalidArgumentException;

class ArrayUtil
{
    /**
     * コールバック関数を用いてデータからキーを取得し、データと紐づける
     *
     * @param array $data
     * @param callable $func
     * @return array
     */
    public static function utoMap(array $data, callable $func) : array
    {
        $result = [];
        while ($row = array_pop($data)) {
            $key = $func($row);
            if (!is_string($key) && !is_int($key)) {
                throw new InvalidArgumentException('関数が有効なキーを返しませんでした。');
            }
            $result[$key] = $row;
        }
        return $result;
    }
}
