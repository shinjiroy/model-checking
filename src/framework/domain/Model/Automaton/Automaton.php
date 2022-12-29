<?php

namespace Domain\Model\Automaton;

use Domain\Value\Event\Event;
use Domain\Value\State\State;
use Domain\Value\Transition\Transition;

/**
 * (有限)オートマトン
 */
class Automaton
{
    /**
     * 状態集合
     *
     * @var State[]
     */
    protected array $states = [];
    /**
     * @return State[]
     */
    public function getStates() : array
    {
        return $this->states;
    }

    /**
     * 初期状態
     *
     * @var State[]
     */
    protected array $initStates = [];
    /**
     * @return State[]
     */
    public function getInitStates() : array
    {
        return $this->initStates;
    }

    /**
     * 受理状態
     *
     * @var State[]
     */
    protected array $finalStates = [];
    /**
     * @return State[]
     */
    public function getFinalStates() : array
    {
        return $this->finalStates;
    }

    /**
     * イベントの集合
     *
     * @var Event[]
     */
    protected array $events = [];
    /**
     * @return Event[]
     */
    public function getEvents() : array
    {
        return $this->events;
    }

    /**
     * 遷移の集合
     *
     * @var Transition[]
     */
    protected array $transitions = [];
    /**
     * @return Transition[]
     */
    public function getTransitions() : array
    {
        return $this->transitions;
    }

    /**
     * コンストラクタ
     *
     * @param State[] $states 状態集合
     * @param array $events イベント、ラベルの集合
     * @param array $transitions 遷移の集合
     */
    public function __construct(
        array $states,
        array $events,
        array $transitions
    ) {
        $this->states = $states;
        foreach ($this->states as $state) {
            if ($state->getType() === State::INIT) {
                $this->initStates[] = $state;
            } else if ($state->getType() === State::FINAL) {
                $this->finalStates[] = $state;
            }
        }

        $this->events = $events;
        $this->transitions = $transitions;
    }
}
