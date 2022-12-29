<?php

namespace Tests\Unit\Domain\Value;

use PHPUnit\Framework\TestCase;
use Domain\Value\Logic\Formula\OrFormula;
use Domain\Value\Logic\Formula\AtomicFormula;

class OrFormulaTest extends TestCase
{
    /**
     * invokeが動作するかのテスト
     * 引数なし
     *
     * @return void
     */
    public function test_invoke_noargs()
    {
        $func1 = function () {
            return true;
        };
        $func2 = function () {
            return false;
        };

        $fml1 = new AtomicFormula($func1);
        $fml2 = new AtomicFormula($func2);
        $fml = new OrFormula($fml1, $fml2);
        $this->assertSame(true, $fml()); // true or false
    }

    /**
     * invokeが動作するかのテスト
     * 引数片方あり
     *
     * @return void
     */
    public function test_invoke_arg_oneside()
    {
        $func1 = function ($arg1, $arg2) {
            return (bool)$arg1;
        };
        $func2 = function () {
            return false;
        };

        $fml1 = new AtomicFormula($func1);
        $fml2 = new AtomicFormula($func2);
        $fml = new OrFormula($fml1, $fml2);

        $fml1Arg = ['test', 0];
        // $fml2Arg = []; // 2番目が引数が無い論理式の場合は指定しなくて良い
        $this->assertSame(true, $fml($fml1Arg)); // true or false
        $fml1Arg = [false, 0];
        // $fml2Arg = [];
        $this->assertSame(false, $fml($fml1Arg)); // false or false
    }

    /**
     * invokeが動作するかのテスト
     * 引数両方あり
     *
     * @return void
     */
    public function test_invoke_arg_both()
    {
        $func1 = function ($arg1, $arg2) {
            return (bool)$arg1;
        };
        $func2 = function ($arg1) {
            return (bool)$arg1;
        };

        $fml1 = new AtomicFormula($func1);
        $fml2 = new AtomicFormula($func2);
        $fml = new OrFormula($fml1, $fml2);

        $fml1Arg = ['test', 0];
        $fml2Arg = ['111'];
        $this->assertSame(true, $fml($fml1Arg, $fml2Arg)); // true or true
        $fml1Arg = [false, 0];
        $fml2Arg = [''];
        $this->assertSame(false, $fml($fml1Arg, $fml2Arg)); // false or false
    }
}
