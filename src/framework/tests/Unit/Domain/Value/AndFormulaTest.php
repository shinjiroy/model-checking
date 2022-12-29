<?php

namespace Tests\Unit\Domain\Value;

use PHPUnit\Framework\TestCase;
use Domain\Value\Logic\Formula\OrFormula;
use Domain\Value\Logic\Formula\AndFormula;
use Domain\Value\Logic\Formula\AtomicFormula;
use Domain\Value\Logic\Formula\NotFormula;

class AndFormulaTest extends TestCase
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
        $fml = new AndFormula($fml1, $fml2);
        $this->assertSame(false, $fml()); // true and false
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
            return true;
        };

        $fml1 = new AtomicFormula($func1);
        $fml2 = new AtomicFormula($func2);
        $fml = new AndFormula($fml1, $fml2);

        $fml1Arg = ['test', 0]; // true and true
        // $fml2Arg = []; // 2番目が引数が無い論理式の場合は指定しなくて良い
        $this->assertSame(true, $fml($fml1Arg));
        $fml1Arg = [false, 0]; // false and true
        // $fml2Arg = [];
        $this->assertSame(false, $fml($fml1Arg));
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
        $fml = new AndFormula($fml1, $fml2);

        $fml1Arg = ['test', 0];
        $fml2Arg = ['111'];
        $this->assertSame(true, $fml($fml1Arg, $fml2Arg)); // true and true
        $fml1Arg = [false, 0];
        $fml2Arg = ['test'];
        $this->assertSame(false, $fml($fml1Arg, $fml2Arg)); // false and true
    }

    /**
     * ドモルガンの法則が成り立つこと
     * not (A and B) iff (not A) or (not B)
     *
     * @return void
     */
    public function test_de_morgan()
    {
        $func1 = function ($arg1) {
            return (bool)$arg1;
        };
        $func2 = function ($arg1) {
            return (bool)$arg1;
        };

        $fml1 = new AtomicFormula($func1);
        $fml2 = new AtomicFormula($func2);

        $left = new NotFormula(new AndFormula($fml1, $fml2));
        $right = new OrFormula(new NotFormula($fml1), new NotFormula($fml2));

        $fml1Arg = [true];
        $fml2Arg = [true];
        $this->assertSame(false, $right($fml1Arg, $fml2Arg));
        $this->assertSame(false, $left($fml1Arg, $fml2Arg));
        $fml1Arg = [true];
        $fml2Arg = [false];
        $this->assertSame(true, $right($fml1Arg, $fml2Arg));
        $this->assertSame(true, $left($fml1Arg, $fml2Arg));
        $fml1Arg = [false];
        $fml2Arg = [true];
        $this->assertSame(true, $right($fml1Arg, $fml2Arg));
        $this->assertSame(true, $left($fml1Arg, $fml2Arg));
        $fml1Arg = [false];
        $fml2Arg = [false];
        $this->assertSame(true, $right($fml1Arg, $fml2Arg));
        $this->assertSame(true, $left($fml1Arg, $fml2Arg));
    }
}
