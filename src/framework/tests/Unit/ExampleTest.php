<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use ModelChecking\Util\ArrayUtil;
use ModelChecking\Value\State\State;
use ModelChecking\Value\Logic\Formula\AtomicFormula;

class ExampleTest extends TestCase
{
    /**
     * Coreの呼び出し確認
     *
     * @return void
     */
    public function test_core()
    {
        new AtomicFormula(function () {
            return true;
        });
        ArrayUtil::utoMap([
            new State('Disarmed', State::INIT),
            new State('Armed'),
            new State('Alarm'),
            new State('Disposal', State::FINAL),
        ], function (State $v) {return $v->getName();});
        $this->assertTrue(true);
    }
}
