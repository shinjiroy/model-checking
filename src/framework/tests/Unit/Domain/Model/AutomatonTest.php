<?php

namespace Tests\Unit\Domain\Model;

use Util\ArrayUtil;
use Domain\Value\State\State;
use Domain\Model\Automaton\Automaton;
use Domain\Value\Event\Event;
use Domain\Value\Transition\Transition;
use PHPUnit\Framework\TestCase;

class AutomatonTest extends TestCase
{
    public function test_constructor()
    {
        // ソフトウェア科学基礎p177 警報装置のオートマトン
        $states = ArrayUtil::utoMap([
            new State('Disarmed', State::INIT),
            new State('Armed'),
            new State('Alarm'),
            new State('Disposal', State::FINAL),
        ], function (State $v) {return $v->getName();});
        $events = ArrayUtil::utoMap([
            new Event('on'),
            new Event('off'),
            new Event('sensor'),
            new Event('stop'),
            new Event('shutdown'),
        ], function (Event $v) {return $v->getLabel();});
        $transitions = [
            new Transition($states['Disarmed'], $events['on'], $states['Armed']),
            new Transition($states['Disarmed'], $events['shutdown'], $states['Disposal']),
            new Transition($states['Armed'], $events['off'], $states['Disarmed']),
            new Transition($states['Armed'], $events['sensor'], $states['Alarm']),
            new Transition($states['Alarm'], $events['stop'], $states['Armed']),
            new Transition($states['Alarm'], $events['off'], $states['Disarmed']),
        ];
        $result = new Automaton($states, $events, $transitions);

        // 参照そのものが一致することを確認する。

        // 状態のチェック
        $this->assertSame($states, $result->getStates());
        $this->assertSame($states['Disarmed'], $result->getInitStates()[0]);
        $this->assertSame($states['Disposal'], $result->getFinalStates()[0]);

        // イベントのチェック
        $this->assertSame($events, $result->getEvents());

        // 遷移のチェック
        $this->assertSame($transitions, $result->getTransitions());
    }
}
