<?php

namespace Tests\Unit\Domain\Value;

use PHPUnit\Framework\TestCase;
use Domain\Value\Logic\Formula\NotFormula;
use Domain\Value\Logic\Formula\AtomicFormula;

class NotFormulaTest extends TestCase
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

        $aFml = new AtomicFormula($func);
        $fml = new NotFormula($aFml);
        $this->assertSame(false, $fml());
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

        $aFml = new AtomicFormula($func);
        $fml = new NotFormula($aFml);

        $this->assertSame(false, $fml('test', 0));
        $this->assertSame(true, $fml(false, 0));
    }
}
