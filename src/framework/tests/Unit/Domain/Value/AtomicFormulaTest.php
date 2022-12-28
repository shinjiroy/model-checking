<?php

namespace Tests\Unit\Domain\Value;

use Domain\Value\Logic\Formula\AtomicFormula;
use PHPUnit\Framework\TestCase;

class AtomicFormulaTest extends TestCase
{
    /**
     * invokeが動作するかのテスト
     * 引数なし
     *
     * @return void
     */
    public function test_invoke_noargs()
    {
        $func = function () {
            return true;
        };

        $fml = new AtomicFormula($func);
        $this->assertSame(true, $fml());
    }

    /**
     * invokeが動作するかのテスト
     * 引数あり
     *
     * @return void
     */
    public function test_invoke_args()
    {
        $func = function ($arg1, $arg2) {
            return (bool)$arg1;
        };

        $fml = new AtomicFormula($func);
        $this->assertSame(true, $fml('test', 0));
        $this->assertSame(false, $fml(false, 0));
    }

    /**
     * bool値以外を返す時エラーとなることのテスト
     *
     * @return void
     */
    public function test_notbool()
    {
        $func = function () {
            return 1;
        };
        $this->expectError();

        $fml = new AtomicFormula($func);
        $fml();
    }
}
