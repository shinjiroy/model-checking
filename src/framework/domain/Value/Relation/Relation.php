<?php

namespace Domain\Value\Relation;

use Domain\Value\State\State;

/**
 * 遷移関係
 */
class Relation
{
    protected State $from;
    protected State $to;

    public function __construct(State $from, State $to)
    {
        $this->from = $from;
        $this->to = $to;
    }
}
